import axios from 'axios';
import { getToken, peekToken, clearSession } from './session';
import { useAuthStore } from '../store/authStore';

const getBaseUrl = () => {
 // EXPO_PUBLIC_API_URL is set in .env (for Expo Go / local dev)
 // and in eas.json env block (for EAS cloud APK builds).
 // Fallback is the production Vercel URL so the app NEVER
 // falls back to localhost — works everywhere without changes.
 return process.env.EXPO_PUBLIC_API_URL || 'https://nexware-backend.up.railway.app';
};

const baseURL = getBaseUrl();

export const api = axios.create({
 baseURL,
 timeout: 8000, // Reduced from 35s since backend is on Railway and does not have cold starts
 headers: {
  'Content-Type': 'application/json',
 },
});

api.interceptors.request.use(async (config) => {
 // Guarantee request drops after 8s even if React Native XHR bridge deadlocks
 if (!config.signal) {
  const controller = new AbortController();
  config.signal = controller.signal;
  setTimeout(() => {
   try { controller.abort(); } catch (e) {}
  }, 8000);
 }

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

export default api;
