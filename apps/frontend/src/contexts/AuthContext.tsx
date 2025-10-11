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
        const storedUser = localStorage.getItem("user");
        const accessToken = localStorage.getItem("access_token");

        if (storedUser && accessToken) {
          setUser(JSON.parse(storedUser));
          // Optionally fetch fresh user data
          try {
            const freshUser = await authApi.getCurrentUser();
            setUser(freshUser);
            localStorage.setItem("user", JSON.stringify(freshUser));
          } catch (error) {
            // Silently fail if token is invalid
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
        localStorage.setItem("access_token", tokens.access_token);

        if (rememberMe) {
          localStorage.setItem("refresh_token", tokens.refresh_token);
        } else {
          // Store in sessionStorage for session-only persistence
          sessionStorage.setItem("refresh_token", tokens.refresh_token);
        }

        // Fetch user data
        const userData = await authApi.getCurrentUser();
        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));

        // Redirect to home page after login
        router.push("/");
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
        localStorage.setItem("access_token", tokens.access_token);
        localStorage.setItem("refresh_token", tokens.refresh_token);

        // Fetch user data
        const userData = await authApi.getCurrentUser();
        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));

        // Redirect to home page after register
        router.push("/");
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
        localStorage.getItem("refresh_token") ||
        sessionStorage.getItem("refresh_token");

      if (refreshToken) {
        try {
          await authApi.logout(refreshToken);
        } catch (error) {
          // Silently fail
        }
      }

      // Clear all auth data
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("refresh_token");

      setUser(null);
      router.push("/auth/login");
    } catch (error) {
      // Silently fail
    }
  }, [router]);

  const refreshToken = useCallback(async () => {
    try {
      const refreshToken =
        localStorage.getItem("refresh_token") ||
        sessionStorage.getItem("refresh_token");

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const tokens = await authApi.refreshToken(refreshToken);

      localStorage.setItem("access_token", tokens.access_token);

      if (localStorage.getItem("refresh_token")) {
        localStorage.setItem("refresh_token", tokens.refresh_token);
      } else {
        sessionStorage.setItem("refresh_token", tokens.refresh_token);
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
