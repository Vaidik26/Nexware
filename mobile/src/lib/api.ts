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
  * Signed-LPO document upload — a multi-megabyte body over mobile data.
  *
  * Two minutes. Photos go in at full camera resolution, so a several-page LPO
  * on a weak warehouse connection genuinely needs this long; cutting it short
  * loses the upload for a request the server was still happily receiving.
  */
 uploadLpo: 120000,
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

export const api = axios.create({
 baseURL,
 timeout: DEFAULT_TIMEOUT_MS,
 headers: {
  'Content-Type': 'application/json',
 },
});

api.interceptors.request.use(async (config) => {
 try {
  // getToken() serves from an in-memory cache after the first call, so the
  // Android KeyStore is touched once per app launch rather than once per
  // request. The 1.2s race that used to guard every call is only needed for
  // that first cold read.
  let token = peekToken();
  if (token === undefined) {
   const timerPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200));
   token = await Promise.race([getToken(), timerPromise]);
  }

  if (token && typeof token === 'string') {
   config.headers.Authorization = `Bearer ${token}`;
  }
 } catch (err) {
  // Continue without blocking request if storage lock is busy
 }
 return config;
});

api.interceptors.response.use(
 (response) => response,
 async (error) => {
  if (error.response?.status === 401) {
   await useAuthStore.getState().logout();
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
  const serverMessage =
   typeof detail === 'string' ? detail : detail?.message || err.response.data?.message;

  if (status === 401 || status === 403) {
   return { kind: 'auth', status, message: serverMessage || 'Your session has expired. Please sign in again.' };
  }
  return { kind: 'server', status, message: serverMessage || fallback };
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
