import axios from 'axios';
import { Platform } from 'react-native';
import { getToken, clearSession } from './session';
import { useAuthStore } from '../store/authStore';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  return 'http://localhost:8000/api';
};

let baseURL = getBaseUrl();
if (Platform.OS === 'android' && (baseURL.includes('localhost') || baseURL.includes('127.0.0.1'))) {
  baseURL = baseURL.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
}

export const api = axios.create({
  baseURL,
  timeout: 20000, // 20-second safety limit to accommodate Vercel serverless cold starts
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
