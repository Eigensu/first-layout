"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
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

const posthogLogger = posthog.logger;

function identifyUser(user: User) {
  posthog.identify(user.id, {
    email: user.email,
    name: user.full_name,
    username: user.username,
    is_admin: user.is_admin,
    is_platform_admin: user.is_platform_admin,
    auth_provider: user.auth_provider,
  });
}

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
            identifyUser(freshUser);
            posthogLogger.info("authenticated session restored", {
              auth_provider: freshUser.auth_provider ?? "unknown",
            });
          } catch (error) {
            // Token invalid/expired: clear all auth artifacts
            localStorage.removeItem(LS_KEYS.ACCESS_TOKEN);
            localStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
            localStorage.removeItem(LS_KEYS.USER);
            sessionStorage.removeItem(LS_KEYS.REFRESH_TOKEN);
            posthog.reset();
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
        identifyUser(userData);
        posthog.capture("user_logged_in", {
          auth_provider: "password",
          remembered_session: rememberMe,
        });
        posthogLogger.info("authenticated session established", {
          auth_provider: "password",
          remembered_session: rememberMe,
        });

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
        identifyUser(userData);
        posthog.capture("user_logged_in", { auth_provider: "google" });
        posthogLogger.info("authenticated session established", {
          auth_provider: "google",
        });

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
        identifyUser(userData);
        posthog.capture("user_registered", {
          auth_provider: userData.auth_provider || "password",
        });
        posthogLogger.info("account registration completed", {
          auth_provider: userData.auth_provider || "password",
        });

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

      posthog.capture("user_logged_out");
      posthogLogger.info("authenticated session ended");
      posthog.reset();
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

  const updateUser = useCallback((fresh: User) => {
    setUser(fresh);
    localStorage.setItem(LS_KEYS.USER, JSON.stringify(fresh));
    identifyUser(fresh);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithGoogle,
    register,
    logout,
    refreshToken,
    updateUser,
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
