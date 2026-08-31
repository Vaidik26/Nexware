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
  logout: () => Promise<void>;
}

/**
 * Drop everything the OUTGOING account left behind in memory.
 *
 * The API response cache is keyed by URL alone, so anything still in it is one
 * account's data waiting to be handed to the next one to sign in on this
 * browser. The sales bootstrap is the same: its customer dictionary and
 * territory map belong to whoever fetched it.
 *
 * Run on BOTH ends of a session change — a sign-out, and a sign-in that follows
 * one that never happened, which is what signing in as somebody else without
 * signing out first is.
 */
async function dropSessionCaches() {
  try {
    const { clearApiCache } = await import('../lib/api');
    clearApiCache();
  } catch (err) {
    console.error('Could not clear the API cache:', err);
  }
  try {
    const { resetBootstrap } = await import('../lib/salesDashboardApi');
    resetBootstrap();
  } catch (err) {
    console.error('Could not clear the sales dashboard cache:', err);
  }
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
      // Signing in as somebody else on this browser — with or without a
      // sign-out in between — must not inherit the previous account's cached
      // responses. Fired after the state is set, so nothing waits on it.
      void dropSessionCaches();
    },
    loadAccess: async () => {
      // The token this answer will belong to. Compared again below: by the time
      // /access/me replies the session may have ended or been replaced, and
      // applying the answer then would hand the CURRENT session the previous
      // account's permissions — or, on a rejection, sign the current one out.
      const token = get().token;
      if (!token) {
        set({ access: null, accessLoaded: true });
        return;
      }
      try {
        const { default: api } = await import('../lib/api');
        const res = await api.get('/access/me', { bypassCache: true } as any);
        if (get().token !== token) return;
        set({ access: res.data, accessLoaded: true });
      } catch (err: any) {
        if (get().token !== token) return;
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
      // Whose session is ending. Captured first: the request below still has to
      // authenticate as that account — it is what clears a picker's push token.
      const endedToken = get().token;

      // THE SESSION IS DROPPED HERE, before anything is awaited.
      //
      // It used to be dropped only after POST /auth/logout answered, which
      // against a remote backend is seconds later. That was long enough for the
      // next person to sign in first — and this continuation then wiped THEIR
      // brand-new session, bouncing them back to the login screen a moment
      // after the welcome message. Switching accounts in one browser was
      // impossible; a second browser worked only because it had no sign-out
      // still in flight.
      localStorage.removeItem('nexware_token');
      localStorage.removeItem('nexware_user');
      set({ user: null, token: null, access: null, accessLoaded: false });

      await dropSessionCaches();

      if (!endedToken) return;
      // Best effort, and deliberately not awaited: nothing on this side depends
      // on the answer. The token is passed explicitly because the store no
      // longer holds one for the request interceptor to attach — and a request
      // that went out unauthenticated would come back 401 and be read as the
      // NEW session expiring.
      try {
        const { default: api } = await import('../lib/api');
        api
          .post('/auth/logout', null, {
            headers: { Authorization: `Bearer ${endedToken}` },
          })
          .catch((err) => console.error('Logout API failed:', err));
      } catch (err) {
        console.error('Logout API failed:', err);
      }
    },
  };
});
