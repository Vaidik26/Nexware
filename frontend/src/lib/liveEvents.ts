import { useEffect, useRef } from 'react';
import { getBaseUrl } from './api';

/**
 * Live updates from the backend WebSocket (`/ws/notifications`).
 *
 * AppLayout owns the single socket for the whole app. It re-broadcasts every
 * message as a DOM CustomEvent so pages that hold their own state (Picklists,
 * the two detail views) can react without being rewritten onto React Query.
 */

export const LIVE_EVENT = 'nexware:live';

export interface LiveEvent {
  event: string;
  message?: string;
  [key: string]: any;
}

/** Which cached API prefixes each backend broadcast makes stale. */
export const EVENT_CACHE_PREFIXES: Record<string, string[]> = {
  ORDER_CREATED: ['/lpos'],
  LPO_UPDATED: ['/lpos'],
  // An assignment moves the picklist and flips its LPO to processed.
  PICKLIST_ASSIGNED: ['/picklists', '/orders', '/lpos'],
  READY_FOR_AUDIT: ['/picklists'],
  PICKLIST_STARTED: ['/picklists'],
  PICKLIST_VERIFIED: ['/picklists'],
  PICKLIST_RETURNED: ['/picklists'],
  PICKLIST_CANCELLED: ['/picklists'],
  PICKLIST_PURGED: ['/picklists'],
  PICKLIST_REASSIGNED: ['/picklists'],
};

/** Events after which the `['lpos']` React Query cache must refetch. */
export const LPO_EVENTS = ['ORDER_CREATED', 'LPO_UPDATED', 'PICKLIST_ASSIGNED'];

/** Events after which any picklist view should re-read from the server. */
export const PICKLIST_EVENTS = [
  'PICKLIST_ASSIGNED',
  'READY_FOR_AUDIT',
  'PICKLIST_STARTED',
  'PICKLIST_VERIFIED',
  'PICKLIST_RETURNED',
  'PICKLIST_CANCELLED',
  'PICKLIST_PURGED',
  'PICKLIST_REASSIGNED',
];

/**
 * The socket lives on the API host, not on the host serving the SPA — in
 * production those are different origins (Vercel vs Railway), and the SPA's
 * catch-all rewrite would answer the handshake with index.html.
 */
export function getWebSocketUrl() {
  const base = getBaseUrl();

  if (!base) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/notifications`;
  }

  // VITE_API_URL is sometimes configured without a scheme ("host.up.railway.app").
  const withScheme = /^https?:\/\//i.test(base) ? base : `https://${base}`;

  return (
    withScheme
      .replace(/^http/i, 'ws')
      .replace(/\/api$/i, '') + '/ws/notifications'
  );
}

/**
 * Run `handler` whenever a live event arrives. Pass `events` to filter; omit it
 * to receive everything. The handler may change every render without
 * re-subscribing.
 */
export function useLiveEvent(handler: (event: LiveEvent) => void, events?: string[]) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const filter = events ? events.join(',') : '';

  useEffect(() => {
    const allowed = filter ? filter.split(',') : null;
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<LiveEvent>).detail;
      if (!detail?.event) return;
      if (allowed && !allowed.includes(detail.event)) return;
      handlerRef.current(detail);
    };
    window.addEventListener(LIVE_EVENT, listener);
    return () => window.removeEventListener(LIVE_EVENT, listener);
  }, [filter]);
}
