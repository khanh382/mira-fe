import { create } from "zustand";
import { getCurrentUser, type AuthUser } from "@/services/AuthService";

interface AuthState {
  isAuth: boolean;
  isChecking: boolean;
  user: AuthUser | null;
  login: (user?: AuthUser | null) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  isAuth: false,
  isChecking: true,
  user: null,
  login: (user) => set({ isAuth: true, isChecking: false, user: user || null }),
  logout: () => set({ isAuth: false, isChecking: false, user: null }),
  checkAuth: async () => {
    try {
      const res = await getCurrentUser();
      set({ isAuth: true, isChecking: false, user: res?.data || null });
    } catch {
      set({ isAuth: false, isChecking: false, user: null });
    }
  },
}));