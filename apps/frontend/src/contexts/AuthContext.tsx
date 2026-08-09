"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { getErrorMessage } from "@/lib/api/client";
import { LS_KEYS, ROUTES } from "@/common/consts";
import type {
  User,
  LoginCredentials,
  RegisterCredentials,
  AuthContextType,
} from "@/types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedUser = localStorage.getItem(LS_KEYS.USER);
        const accessToken = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);

        if (storedUser && accessToken) {
          // Validate token by fetching fresh user; if it fails, clear auth
          try {
            const freshUser = await authApi.getCurrentUser();
            setUser(freshUser);
            localStorage.setItem(LS_KEYS.USER, JSON.stringify(freshUser));
          } catch (error) {
            // Token invalid/expired: clear all auth artifacts
            localStorage.removeItem(LS_KEYS.ACCESS_TOKEN);
            localStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
            localStorage.removeItem(LS_KEYS.USER);
            sessionStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
            setUser(null);
          }
        }
      } catch (error) {
        // Silently fail
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials, rememberMe: boolean = false) => {
      try {
        const tokens = await authApi.login(credentials);

        // Store tokens
        localStorage.setItem(LS_KEYS.ACCESS_TOKEN, tokens.access_token);

        if (rememberMe) {
          localStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);
        } else {
          // Store in sessionStorage for session-only persistence
          sessionStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);
        }

        // Fetch user data
        const userData = await authApi.getCurrentUser();
        setUser(userData);
        localStorage.setItem(LS_KEYS.USER, JSON.stringify(userData));

        // Redirect to home page after login
        router.push(ROUTES.HOME);
      } catch (error) {
        const message = getErrorMessage(error);
        throw new Error(message);
      }
    },
    [router]
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      try {
        const tokens = await authApi.googleLogin(idToken);

        // Google sign-in has no "remember me" checkbox; persist like a
        // normal remembered session.
        localStorage.setItem(LS_KEYS.ACCESS_TOKEN, tokens.access_token);
        localStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);

        const userData = await authApi.getCurrentUser();
        setUser(userData);
        localStorage.setItem(LS_KEYS.USER, JSON.stringify(userData));

        router.push(ROUTES.HOME);
      } catch (error) {
        const message = getErrorMessage(error);
        throw new Error(message);
      }
    },
    [router]
  );

  const register = useCallback(
    async (credentials: RegisterCredentials) => {
      try {
        const tokens = await authApi.register(credentials);

        // Store tokens
        localStorage.setItem(LS_KEYS.ACCESS_TOKEN, tokens.access_token);
        localStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);

        // Fetch user data
        const userData = await authApi.getCurrentUser();
        setUser(userData);
        localStorage.setItem(LS_KEYS.USER, JSON.stringify(userData));

        // Redirect to home page after register
        router.push(ROUTES.HOME);
      } catch (error) {
        const message = getErrorMessage(error);
        throw new Error(message);
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken =
        localStorage.getItem(LS_KEYS.REFRESH_TOKEN) ||
        sessionStorage.getItem(LS_KEYS.REFRESH_TOKEN);

      if (refreshToken) {
        try {
          await authApi.logout(refreshToken);
        } catch (error) {
          // Silently fail
        }
      }

      // Clear all auth data
      localStorage.removeItem(LS_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(LS_KEYS.USER);
      sessionStorage.removeItem(LS_KEYS.REFRESH_TOKEN);

      setUser(null);
      router.push(ROUTES.LOGIN);
    } catch (error) {
      // Silently fail
    }
  }, [router]);

  const refreshToken = useCallback(async () => {
    try {
      const refreshToken =
        localStorage.getItem(LS_KEYS.REFRESH_TOKEN) ||
        sessionStorage.getItem(LS_KEYS.REFRESH_TOKEN);

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const tokens = await authApi.refreshToken(refreshToken);

      localStorage.setItem(LS_KEYS.ACCESS_TOKEN, tokens.access_token);

      if (localStorage.getItem(LS_KEYS.REFRESH_TOKEN)) {
        localStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);
      } else {
        sessionStorage.setItem(LS_KEYS.REFRESH_TOKEN, tokens.refresh_token);
      }
    } catch (error) {
      await logout();
    }
  }, [logout]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithGoogle,
    register,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
