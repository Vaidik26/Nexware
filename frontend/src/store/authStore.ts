import { create } from 'zustand';

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
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedToken = localStorage.getItem('nexware_token');
  const savedUser = localStorage.getItem('nexware_user');
  
  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken || null,
    login: (user, token) => {
      localStorage.setItem('nexware_token', token);
      localStorage.setItem('nexware_user', JSON.stringify(user));
      set({ user, token });
    },
    logout: async () => {
      try {
        const { default: api } = await import('../lib/api');
        await api.post('/auth/logout');
      } catch (err) {
        console.error('Logout API failed:', err);
      }
      localStorage.removeItem('nexware_token');
      localStorage.removeItem('nexware_user');
      set({ user: null, token: null });
    },
  };
});
