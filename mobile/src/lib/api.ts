import axios, { AxiosError } from 'axios';
import { getToken, peekToken } from './session';
import { useAuthStore } from '../store/authStore';

const getBaseUrl = () => {
 // EXPO_PUBLIC_API_URL is set in .env (for Expo Go / local dev)
 // and in eas.json env block (for EAS cloud APK builds).
 // Fallback is the production Vercel URL so the app NEVER
 // falls back to localhost — works everywhere without changes.
 return process.env.EXPO_PUBLIC_API_URL || 'https://nexware-backend.up.railway.app';
};

const baseURL = getBaseUrl();

/**
 * Per-operation time budgets, in milliseconds.
 *
 * These are deliberately named after the operation rather than the endpoint:
 * how long a salesperson should reasonably wait depends on what they asked for,
 * not on which route serves it.
 *
 * Pass one explicitly at the call site. Anything that does not is covered by the
 * instance default below, which exists only so a request cannot hang forever.
 */
export const TIMEOUT = {
 /** Customer list / search. */
 customers: 30000,
 /** Product catalogue. */
 catalogue: 20000,
 /**
  * Signed-LPO document upload — no time limit.
  *
  * 0 disables the timeout in axios. Photos go in at full camera resolution, so
  * the body is large and the time it takes depends entirely on the warehouse
  * connection; every fixed budget tried here cut off uploads the server was
  * still happily receiving. The request now ends when the network or the server
  * ends it.
  *
  * The cost is that a genuinely dead connection leaves the spinner up until the
  * OS gives up on the socket, so the upload screens must keep offering a way
  * out rather than relying on a timeout to release them.
  */
 uploadLpo: 0,
 /** Order creation. */
 createOrder: 45000,
} as const;

/**
 * Fallback for calls with no explicit budget.
 *
 * Was 8000, which was far too short for anything carrying a file and was also
 * being applied by an AbortController that ignored per-request overrides — so a
 * call site asking for 60s still died at 8s. That interceptor is gone; axios's
 * own timeout is used instead, which starts when the request is actually sent
 * rather than while the token is being read from secure storage.
 */
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * How long the first keystore read of a launch may take before requests give up
 * on it.
 *
 * Generous on purpose. It is paid at most once per launch, and the only thing
 * it protects against is a keystore that never answers at all — not one that is
 * slow, which is the common case and must be waited out rather than guessed at.
 */
const TOKEN_READ_TIMEOUT_MS = 8000;

export const api = axios.create({
 baseURL,
 timeout: DEFAULT_TIMEOUT_MS,
 headers: {
  'Content-Type': 'application/json',
 },
});

api.interceptors.request.use(async (config) => {
 // The instance declares Content-Type: application/json, which is right for
 // almost every call and catastrophic for the few that post a file: the server
 // receives a multipart body labelled as JSON, fails to find the file field,
 // and rejects the request with a 422 before any of it is uploaded.
 //
 // Correcting it here rather than trusting each call site to remember. React
 // Native replaces the value with the real boundary when it serialises the
 // FormData, so naming the type without one is enough.
 if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
  config.headers['Content-Type'] = 'multipart/form-data';
 }

 // getToken() serves from an in-memory cache after the first call, so the
 // Android KeyStore is touched once per app launch rather than once per request.
 // Only that first cold read can be slow enough to need guarding.
 let token = peekToken();
 if (token === undefined) {
  // The read is raced, but losing the race now FAILS the request instead of
  // sending it anyway.
  //
  // The previous guard resolved to null after 1.2s and fell through to the
  // check below, which simply omitted the Authorization header — so a keystore
  // that was merely slow produced a request indistinguishable from one with no
  // session at all. The server answers those with 401, and a 401 is read here
  // as "this session is over". A perfectly valid token was thereby thrown away
  // because the device was busy, which on a phone full of a day's LPO photos is
  // exactly when it is busiest.
  //
  // A timer winning means "not read yet". It does not mean "not signed in", and
  // the two must never reach the server looking the same.
  const timeout = new Promise<never>((_, reject) =>
   setTimeout(
    () => reject(new Error('Timed out reading the stored session. Please try again.')),
    TOKEN_READ_TIMEOUT_MS
   )
  );
  token = await Promise.race([getToken(), timeout]);
 }

 // A null token is a real answer — nobody is signed in — and the request is
 // allowed through bare so /auth/login still works.
 if (token && typeof token === 'string') {
  config.headers.Authorization = `Bearer ${token}`;
 }
 return config;
});

/**
 * Endpoints whose own 401 must not trigger the session teardown below.
 *
 * `/auth/login` answers 401 for a wrong password — that is the endpoint working,
 * not a session expiring, and signing the user out over it is meaningless.
 *
 * `/auth/logout` answers 401 when there is no valid token, which is exactly the
 * situation logout() is called in. Reacting to that by calling logout() again
 * recurses without end: each attempt 401s and schedules another. Because every
 * level awaits the next, the original request never settles and the screen sits
 * on its spinner forever instead of reporting the failure.
 */
const NO_AUTO_LOGOUT_PATHS = ['/auth/login', '/auth/logout'];

api.interceptors.response.use(
 (response) => response,
 (error) => {
  const url = error.config?.url || '';
  const isAuthEndpoint = NO_AUTO_LOGOUT_PATHS.some((path) => url.includes(path));

  if (error.response?.status === 401 && !isAuthEndpoint) {
   // Started, not awaited.
   //
   // Awaiting it here is what wedged the app. The failed request could not
   // settle until sign-out had finished, so the `finally` on every screen —
   // the one that clears the spinner — sat behind a network round trip and two
   // keystore deletes. The caller needs its rejection now; tearing the session
   // down is not something it should be made to wait for.
   void useAuthStore.getState().logout();
  }
  return Promise.reject(error);
 }
);

/** What went wrong, at the level of detail worth showing a user. */
export type ApiFailureKind = 'timeout' | 'offline' | 'server' | 'auth' | 'unknown';

export interface ApiFailure {
 kind: ApiFailureKind;
 status?: number;
 message: string;
}

/**
 * Turn an axios rejection into something a screen can act on.
 *
 * Previously every failure reached the UI as the same opaque object, so screens
 * fell back to one generic string and a network timeout was indistinguishable
 * from the server rejecting the request.
 *
 * @param error   The value caught from an `api.*` call.
 * @param fallback Message used when the failure is not one of the known kinds.
 */
export function describeApiError(error: unknown, fallback: string): ApiFailure {
 const err = error as AxiosError<any>;

 // The server answered — prefer whatever it said over anything invented here.
 if (err?.response) {
  const status = err.response.status;
  const detail = err.response.data?.detail;

  let serverMessage: string | undefined;
  if (typeof detail === 'string') {
   serverMessage = detail;
  } else if (Array.isArray(detail)) {
   // FastAPI request-validation errors arrive as a list of {loc, msg, type}.
   // Reading `.message` off the array yields undefined, which used to collapse
   // a precise validation complaint into the caller's generic fallback.
   serverMessage = detail
    .map((d: any) => (typeof d === 'string' ? d : d?.msg))
    .filter(Boolean)
    .join('; ');
  } else {
   serverMessage = detail?.message;
  }
  serverMessage = serverMessage || err.response.data?.message;

  if (status === 401 || status === 403) {
   return { kind: 'auth', status, message: serverMessage || 'Your session has expired. Please sign in again.' };
  }
  return { kind: 'server', status, message: serverMessage || `${fallback} (error ${status})` };
 }

 // No response. Axios reports its own timeout as ECONNABORTED; a dropped or
 // absent connection comes back as ERR_NETWORK.
 if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
  return {
   kind: 'timeout',
   message: 'The network is too slow to finish this right now. Please try again.',
  };
 }
 if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
  return {
   kind: 'offline',
   message: 'No internet connection. Check your network and try again.',
  };
 }

 return { kind: 'unknown', message: (err as any)?.message || fallback };
}

export default api;
