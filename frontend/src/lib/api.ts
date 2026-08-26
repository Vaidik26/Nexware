import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  
  if (import.meta.env.PROD) {
    console.warn('VITE_API_URL is not set. Production requests will fail if not configured.');
    return '';
  }
  
  return 'http://localhost:8000';
};

const api = axios.create({
  baseURL: getBaseUrl(),
});

// In-Memory Global Master Cache & Request Deduplication
interface CacheEntry {
  data: any;
  status: number;
  statusText: string;
  headers: any;
  config: any;
  timestamp: number;
}

const cacheMap = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes retention (auto-invalidates on mutations)

export function clearApiCache(prefix?: string) {
  if (!prefix) {
    cacheMap.clear();
  } else {
    for (const key of cacheMap.keys()) {
      if (key.includes(prefix)) {
        cacheMap.delete(key);
      }
    }
  }
}

export function handleMutationInvalidation(url?: string) {
  if (!url) {
    cacheMap.clear();
    return;
  }
  if (url.includes('/catalogue')) clearApiCache('/catalogue');
  else if (url.includes('/users')) clearApiCache('/users');
  else if (url.includes('/lpos')) clearApiCache('/lpos');
  else if (url.includes('/picklists') || url.includes('/orders')) {
    clearApiCache('/picklists');
    clearApiCache('/orders');
  }
  else if (url.includes('/market')) clearApiCache('/market');
  else clearApiCache();
}

// Background Preloader: Silently loads all module master datasets on app startup
export async function preloadAllMasterData() {
  const endpoints = [
    '/catalogue',
    '/users',
    '/users?role=picker',
    '/picklists',
    '/market/materials',
    '/market/prices/trend?range=7d',
  ];
  await Promise.allSettled(
    endpoints.map((url) => api.get(url, { bypassCache: true } as any))
  );
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Automatically wipe relevant module cache when Admin creates, modifies, or deletes records
    if (response.config.method && ['post', 'put', 'patch', 'delete'].includes(response.config.method.toLowerCase())) {
      handleMutationInvalidation(response.config.url);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      clearApiCache();
    }
    return Promise.reject(error);
  }
);

// Smart GET override: Serves cached data instantly (0ms) and prevents duplicate HTTP network requests
const originalGet = api.get.bind(api);
api.get = async (url: string, config?: any) => {
  const bypassCache = config?.bypassCache === true;
  
  // Do not cache binary downloads (Excel/PDF exports) or authentication checks
  if (config?.responseType === 'blob' || config?.responseType === 'arraybuffer' || url.includes('/auth/')) {
    return originalGet(url, config);
  }

  let cacheKey = url;
  if (config?.params) {
    try {
      cacheKey += '?' + JSON.stringify(config.params);
    } catch {
      // ignore formatting error
    }
  }

  // 1. Return instantly from in-memory cache if valid
  if (!bypassCache && cacheMap.has(cacheKey)) {
    const entry = cacheMap.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL) {
      return Promise.resolve({
        data: JSON.parse(JSON.stringify(entry.data)),
        status: entry.status,
        statusText: entry.statusText,
        headers: entry.headers,
        config: entry.config,
      });
    } else {
      cacheMap.delete(cacheKey);
    }
  }

  // 2. Request deduplication: if identical fetch is already in flight, reuse its promise
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const requestPromise = originalGet(url, config)
    .then((response) => {
      if (response.status >= 200 && response.status < 300) {
        cacheMap.set(cacheKey, {
          data: JSON.parse(JSON.stringify(response.data)),
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          config: response.config,
          timestamp: Date.now(),
        });
      }
      pendingRequests.delete(cacheKey);
      return response;
    })
    .catch((err) => {
      pendingRequests.delete(cacheKey);
      throw err;
    });

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export default api;

