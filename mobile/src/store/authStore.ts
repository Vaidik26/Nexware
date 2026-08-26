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

export const useAuthStore = create<AuthState>((set) => ({
 picker: null,
 isAuthenticated: false,
 isPicking: false,
 setIsPicking: (isPicking) => set({ isPicking }),
 setPicker: (picker) => set({ picker }),
 setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
 logout: async () => {
  try {
   const { default: api } = await import('../lib/api');
   await api.post('/auth/logout');
  } catch (err) {
   console.warn('Logout API failed:', err);
  }
  await clearSession();
  set({ picker: null, isAuthenticated: false });
 },
}));
