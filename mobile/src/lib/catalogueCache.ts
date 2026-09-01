import api, { TIMEOUT } from './api';

/**
 * Shared product catalogue for the LPO screens.
 *
 * Both the create screen and the edit screen fetched the full catalogue on every
 * mount. It is a few hundred rows of master data that changes rarely, so each
 * visit paid a full round trip and a JSON parse for a list that was almost
 * certainly identical to the one fetched a minute earlier.
 *
 * This serves a cached copy immediately and refreshes in the background when it
 * is older than the TTL, so the item picker opens instantly after the first use.
 */

const TTL_MS = 10 * 60 * 1000;

let cache: any[] | null = null;
let fetchedAt = 0;
let inFlight: Promise<any[]> | null = null;

async function load(): Promise<any[]> {
  const res = await api.get('/catalogue', { timeout: TIMEOUT.catalogue });
  cache = res.data || [];
  fetchedAt = Date.now();
  return cache!;
}

/**
 * Return the catalogue, preferring the cache.
 *
 * @param onUpdate Called with fresh data if a background refresh finds newer
 *                 rows after the cached copy was already returned.
 */
export async function getCatalogue(onUpdate?: (items: any[]) => void): Promise<any[]> {
  const isStale = Date.now() - fetchedAt > TTL_MS;

  if (cache && !isStale) return cache;

  if (cache && isStale) {
    // Show what we have now; quietly replace it when the network answers.
    if (!inFlight) {
      inFlight = load().finally(() => {
        inFlight = null;
      });
      inFlight.then((fresh) => onUpdate?.(fresh)).catch(() => {});
    }
    return cache;
  }

  // Cold start: no cached copy, so the caller has to wait. Concurrent callers
  // share the one request rather than each firing their own.
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null;
    });
  }
  try {
    return await inFlight;
  } catch (err) {
    // Only swallow the failure when there is something real to fall back on.
    //
    // Returning [] on a cold start reported success with an empty product list,
    // so a slow connection looked exactly like a catalogue with nothing in it —
    // the caller had no way to tell the difference and showed an empty picker
    // with no error. Let the caller decide how to say so.
    if (cache) return cache;
    throw err;
  }
}

/** Force the next read to hit the network — call after editing the catalogue. */
export function invalidateCatalogue() {
  fetchedAt = 0;
}
