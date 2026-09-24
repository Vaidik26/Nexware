import { create } from 'zustand';
import { clearSession } from '../lib/session';

export interface PickerInfo {
 id: string | number;
 name?: string;
 full_name?: string;
 email: string;
 user_type: string;
 initials?: string;
 isAvailable?: boolean;
}

interface AuthState {
 picker: PickerInfo | null;
 isAuthenticated: boolean;
 isPicking: boolean;
 setIsPicking: (isPicking: boolean) => void;
 setPicker: (picker: PickerInfo | null) => void;
 setAuthenticated: (isAuthenticated: boolean) => void;
 logout: () => Promise<void>;
}

/**
 * The sign-out currently running, if any.
 *
 * A token the server no longer accepts fails every request in flight at once —
 * the LPO create screen alone asks for customers, the catalogue and the user's
 * history together — and each of those failures used to start its own teardown.
 * That raced three concurrent SecureStore deletes against one another on the
 * Android KeyStore, which is the contention that makes one of them throw in the
 * first place. One sign-out is enough; everyone else joins the one in progress.
 */
let logoutInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => {
 const performLogout = async () => {
  // Read before anything is cleared. The request at the end still has to
  // authenticate as this account — it is what clears a picker's push token —
  // and by then the store no longer holds a token to attach.
  let endedToken: string | null = null;
  try {
   const { peekToken, getToken } = await import('../lib/session');
   endedToken = peekToken() ?? (await getToken());
  } catch {
   // Unreadable storage means there is no session worth reporting to the server.
  }

  // THE SESSION ENDS HERE, before anything is awaited.
  //
  // This used to run last, after the network call and after clearSession() —
  // and clearSession() sat outside the try, so a keystore failure skipped it
  // entirely. The app was then left holding isAuthenticated: true against a
  // token the server refuses: no redirect to the login screen, no way back,
  // and nothing a restart could fix because the token was still on disk.
  set({ picker: null, isAuthenticated: false });

  try {
   await clearSession();
  } catch (err) {
   // clearSession drops the in-memory caches before it touches the keystore,
   // so the token is already unusable for the rest of this launch even if the
   // delete failed. It must never be allowed to block the state change above.
   console.warn('Could not clear stored session:', err);
  }

  if (!endedToken) return;
  try {
   const { default: api } = await import('../lib/api');
   // Short budget, and the token supplied explicitly because the request
   // interceptor has nothing left to read. A best-effort courtesy to the
   // server: the local session is already gone either way.
   await api.post('/auth/logout', null, {
    timeout: 5000,
    headers: { Authorization: `Bearer ${endedToken}` },
   });
  } catch (err) {
   console.warn('Logout API failed:', err);
  }
 };

 return {
  picker: null,
  isAuthenticated: false,
  isPicking: false,
  setIsPicking: (isPicking) => set({ isPicking }),
  setPicker: (picker) => set({ picker }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  logout: () => {
   if (!logoutInFlight) {
    logoutInFlight = performLogout().finally(() => {
     logoutInFlight = null;
    });
   }
   return logoutInFlight;
  },
 };
});
