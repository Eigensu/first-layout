"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "./Input";
import { Button } from "@/components/ui/Button";
import { Zap, ChevronRight } from "lucide-react";

// Validation schema matching backend requirements
const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(50, "Username must not exceed 50 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, underscores, and hyphens"
      ),
    email: z.string().email("Please enter a valid email address"),
    full_name: z.string().min(1, "Full name is required").optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one digit"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { register: registerUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const { confirmPassword, ...registerData } = data;
      await registerUser(registerData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again."
      );
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
              alt="WalleFantasy Logo"
              width={64}
              height={64}
              className="object-cover"
            />
          </div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent">
            WalleFantasy
          </h1>
        </div>
        <p className="text-gray-600">Create your account</p>
      </div>

      {/* Register Form */}
      <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 shadow-[0_35px_140px_-10px_rgba(191,171,121,0.5)]">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <Input
            {...register("username")}
            type="text"
            placeholder="Choose a username"
            icon="user"
            error={errors.username?.message}
            disabled={isLoading}
            variant="light"
            className="rounded-2xl"
          />

          <Input
            {...register("email")}
            type="email"
            placeholder="Enter your email"
            icon="email"
            error={errors.email?.message}
            disabled={isLoading}
            variant="light"
            className="rounded-2xl"
          />

          {/* Full name field removed as requested */}

          <Input
            {...register("password")}
            type="password"
            placeholder="Create a password"
            icon="password"
            error={errors.password?.message}
            disabled={isLoading}
            variant="light"
            className="rounded-2xl"
          />

          {/* Password guidance */}
          <p className="text-xs text-gray-500 pl-2 -mt-2">
            Password should be at least 15 characters OR at least 8 characters
            including a number and a lowercase letter.
          </p>

          <Input
            {...register("confirmPassword")}
            type="password"
            placeholder="Confirm your password"
            icon="password"
            error={errors.confirmPassword?.message}
            disabled={isLoading}
            variant="light"
            className="rounded-2xl"
          />

          {/* Password requirements removed as requested */}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            disabled={isLoading}
          >
            {isLoading ? (
              "Creating account..."
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <span>Create Account</span>
                <ChevronRight className="w-5 h-5" />
              </span>
            )}
          </Button>

          {/* Login Link */}
          <div className="text-center pt-4">
            <p className="text-gray-600">
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-primary-600 hover:text-primary-700 font-semibold transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>
        </form>
      </div>

      {/* Footer Note */}
      <p className="text-center text-xs text-gray-500 mt-4">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
