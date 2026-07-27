import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Global safe error message formatter to PREVENT blank white screen crashes from FastAPI 422 array responses
export function getErrorMessage(error: any, fallback = 'An unexpected error occurred'): string {
  if (!error) return fallback;
  const detail = error?.response?.data?.detail || error?.message || fallback;
  
  // When FastAPI returns 422 Unprocessable Entity, detail is an Array of validation errors [{loc, msg, type}]
  if (Array.isArray(detail)) {
    return detail.map((errItem: any) => {
      const field = Array.isArray(errItem?.loc) ? errItem.loc[errItem.loc.length - 1] : 'Field';
      return `${field}: ${errItem?.msg || 'Invalid value'}`;
    }).join(' | ');
  }
  
  if (typeof detail === 'object') {
    return JSON.stringify(detail);
  }
  
  return String(detail);
}

// In-memory data cache to deliver instant 0ms switching between enterprise tabs
const memoryCache: Record<string, { data: any; timestamp: number }> = {};

export function getCachedData<T>(key: string, maxAgeMs = 60000): T | null {
  const item = memoryCache[key];
  if (item && Date.now() - item.timestamp < maxAgeMs) {
    return item.data as T;
  }
  return null;
}

export function setCachedData<T>(key: string, data: T): void {
  memoryCache[key] = { data, timestamp: Date.now() };
}

