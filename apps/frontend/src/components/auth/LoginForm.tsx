"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "./Input";
import { Button } from "@/components/ui/Button";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { loginSchema, type LoginFormData } from "./loginSchema";

export function LoginForm() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleCredential = async (idToken: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await loginWithGoogle(idToken);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      await login(data, rememberMe);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4">
      {/* Logo and Welcome */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg overflow-hidden">
            <Image
              src="/logo.jpeg"
              alt="Wall-E Arena Logo"
              width={64}
              height={64}
              className="object-cover"
            />
          </div>
          <h1 className="text-4xl font-extrabold text-accent-pink-soft">
            Wall-E Arena
          </h1>
        </div>
        <p className="text-text-muted">Welcome back! Ready to play?</p>
      </div>

      {/* Login Form */}
      <div className="bg-bg-card rounded-3xl p-6 sm:p-8 shadow-pink-soft">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <Input
              {...register("username")}
              type="text"
              placeholder="Mobile number or email"
              icon="user"
              error={errors.username?.message}
              disabled={isLoading}
              variant="light"
              autoComplete="username"
            />
            <p className="mt-1.5 px-1 text-xs text-text-muted">
              One account for every Wall-E Arena tournament. Used a username
              before? It still works for now.
            </p>
          </div>

          <Input
            {...register("password")}
            type="password"
            placeholder="Enter your password"
            icon="password"
            error={errors.password?.message}
            disabled={isLoading}
            variant="light"
          />

          {/* Remember Me */}
          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="ml-2 text-sm text-text-muted">Remember me</span>
            </label>
            <button
              type="button"
              className="text-sm text-text-muted hover:text-accent-pink-soft font-medium"
              onClick={() => router.push("/auth/forgot-password")}
            >
              Forgot password?
            </button>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-gradient-primary text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>

          {/* Google Sign-In */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-bg-card px-3 text-text-muted">or</span>
            </div>
          </div>
          <GoogleSignInButton
            onCredential={handleGoogleCredential}
            text="signin_with"
            disabled={isLoading}
          />

          {/* Register Link */}
          <div className="text-center pt-4">
            <p className="text-text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/register"
                className="text-accent-pink-soft hover:text-accent-pink font-semibold transition-colors"
              >
                Create Account
              </Link>
            </p>
          </div>
        </form>
      </div>
      {/* Legacy modal removed */}
      <p className="text-center text-xs text-text-muted mt-4">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
