import { create } from 'zustand';
import type { EffectiveAccess } from '@/lib/access';

export interface User {
  id: string | number;
  full_name?: string;
  name?: string;
  email: string;
  user_type: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  /**
   * The signed-in account's resolved portal access, or null while it is being
   * read. DELIBERATELY NOT PERSISTED: the user object below survives a reload
   * in localStorage, where whoever holds the browser can edit it, so a
   * permission read out of it would be a permission granted by the holder.
   * `loadAccess` re-reads it from the server on every boot instead.
   */
  access: EffectiveAccess | null;
  /** False until /access/me has answered. Distinguishes "still loading" from
   *  "loaded, and this account holds nothing" — which must look different. */
  accessLoaded: boolean;
  login: (user: User, token: string, access: EffectiveAccess) => void;
  loadAccess: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const savedToken = localStorage.getItem('nexware_token');
  const savedUser = localStorage.getItem('nexware_user');

  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken || null,
    access: null,
    accessLoaded: false,
    login: (user, token, access) => {
      localStorage.setItem('nexware_token', token);
      localStorage.setItem('nexware_user', JSON.stringify(user));
      set({ user, token, access, accessLoaded: true });
    },
    loadAccess: async () => {
      if (!get().token) {
        set({ access: null, accessLoaded: true });
        return;
      }
      try {
        const { default: api } = await import('../lib/api');
        const res = await api.get('/access/me', { bypassCache: true } as any);
        set({ access: res.data, accessLoaded: true });
      } catch (err: any) {
        // A rejected token means the session is over — drop it rather than
        // leaving the app authenticated with no idea what it may open.
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          localStorage.removeItem('nexware_token');
          localStorage.removeItem('nexware_user');
          set({ user: null, token: null, access: null, accessLoaded: true });
          return;
        }
        // Anything else (the server is down, the network dropped) leaves access
        // null and loaded — which opens nothing. Failing closed on a transient
        // error costs a reload; failing open costs a leak.
        console.error('Could not read account access:', err);
        set({ access: null, accessLoaded: true });
      }
    },
    logout: async () => {
      try {
        const { default: api, clearApiCache } = await import('../lib/api');
        await api.post('/auth/logout');
        clearApiCache();
      } catch (err) {
        console.error('Logout API failed:', err);
      }
      // The bootstrap is scoped to the account that fetched it — its customer
      // dictionary and territory maps are that user's. Leaving it cached would
      // show the next person to sign in on this browser the previous one's.
      try {
        const { resetBootstrap } = await import('../lib/salesDashboardApi');
        resetBootstrap();
      } catch (err) {
        console.error('Could not clear the sales dashboard cache:', err);
      }
      localStorage.removeItem('nexware_token');
      localStorage.removeItem('nexware_user');
      set({ user: null, token: null, access: null, accessLoaded: false });
    },
  };
});
