import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

export const getBaseUrl = () => {
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

// Operational endpoints change from outside this tab — a picker on the mobile app, a
// second admin, an LPO posted by a sales rep. Serving those from the master cache is
// what made LPO Management and Picklists look frozen until a hard browser reload, so
// they are read-through only. They still benefit from in-flight deduplication below.
const VOLATILE_PREFIXES = ['/lpos', '/picklists', '/orders', '/pickers'];

function getCacheTtl(url: string) {
  return VOLATILE_PREFIXES.some((p) => url.startsWith(p) || url.startsWith(`/api${p}`))
    ? 0
    : CACHE_TTL;
}

export function clearApiCache(prefix?: string) {
  if (!prefix) {
    cacheMap.clear();
    pendingRequests.clear();
  } else {
    for (const key of cacheMap.keys()) {
      if (key.includes(prefix)) {
        cacheMap.delete(key);
      }
    }
    for (const key of pendingRequests.keys()) {
      if (key.includes(prefix)) {
        pendingRequests.delete(key);
      }
    }
  }
}

// Drop several cache prefixes at once. Used by the live WebSocket handler, where one
// event can touch more than one module (a picklist assignment also moves its LPO).
export function invalidateApiCache(prefixes: string[]) {
  prefixes.forEach((prefix) => clearApiCache(prefix));
}

export function handleMutationInvalidation(url?: string) {
  if (!url) {
    cacheMap.clear();
    return;
  }
  if (url.includes('/catalogue')) clearApiCache('/catalogue');
  // The four user route groups. Checked before the generic branches and, in the
  // case of /dashboard-users, before '/sales' — '/dashboard-users' contains no
  // '/sales', but keeping the user groups together makes the set obvious.
  else if (url.includes('/pickers')) clearApiCache('/pickers');
  else if (url.includes('/admins')) clearApiCache('/admins');
  else if (url.includes('/dashboard-users')) clearApiCache('/dashboard-users');
  else if (url.includes('/sales')) clearApiCache('/sales');
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
    '/pickers',
    '/admins',
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
      const currentToken = useAuthStore.getState().token;
      const requestAuth = error.config?.headers?.Authorization;
      const requestToken = requestAuth ? requestAuth.replace('Bearer ', '') : null;

      // Only log out if the 401 was for the currently active token
      // (prevents in-flight requests from a previous session killing a new login)
      if (!currentToken || requestToken === currentToken) {
        useAuthStore.getState().logout();
        clearApiCache();
      }
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

  const ttl = getCacheTtl(url);

  // 1. Return instantly from in-memory cache if valid
  if (!bypassCache && ttl > 0 && cacheMap.has(cacheKey)) {
    const entry = cacheMap.get(cacheKey)!;
    if (Date.now() - entry.timestamp < ttl) {
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

  // 2. Request deduplication: if identical fetch is already in flight, reuse its promise.
  // A bypassCache caller never joins one. That request was issued BEFORE this
  // caller asked, so its answer can predate the mutation this read exists to
  // pick up — which is how a saved role or supervisor area came back looking
  // unchanged. Such a caller always goes to the network; it still PUBLISHES its
  // promise below, so ordinary cache-tolerant readers keep deduplicating onto it.
  if (!bypassCache && pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const requestPromise = originalGet(url, config)
    .then((response) => {
      if (ttl > 0 && response.status >= 200 && response.status < 300) {
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

