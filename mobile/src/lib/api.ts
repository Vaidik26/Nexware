import axios from 'axios';
import { getToken, clearSession } from './session';
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
 timeout: 35000, // 35-second safety limit to accommodate Vercel serverless cold starts
 headers: {
  'Content-Type': 'application/json',
 },
});

api.interceptors.request.use(async (config) => {
 try {
  // Race timeout on SecureStore to prevent Android KeyStore hanging on app reopen
  const tokenPromise = getToken();
  const timerPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Token read timeout')), 1200));
  const token = await Promise.race([tokenPromise, timerPromise]);
  
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
