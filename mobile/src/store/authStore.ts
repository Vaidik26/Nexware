import { create } from 'zustand';
import { clearSession } from '../lib/session';

export interface PickerInfo {
  id: string | number;
  name?: string;
  full_name?: string;
  email: string;
  role: string;
  initials?: string;
  isAvailable?: boolean;
}

interface AuthState {
  picker: PickerInfo | null;
  isAuthenticated: boolean;
  setPicker: (picker: PickerInfo | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  picker: null,
  isAuthenticated: false,
  setPicker: (picker) => set({ picker }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  logout: async () => {
    await clearSession();
    set({ picker: null, isAuthenticated: false });
  },
}));
