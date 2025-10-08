"use client";

import React, { forwardRef, useState } from "react";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: "email" | "password" | "user";
  variant?: "dark" | "light";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, type, className = "", variant = "dark", ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordField = type === "password";
    const inputType = isPasswordField && showPassword ? "text" : type;

    const IconComponent =
      icon === "email"
        ? Mail
        : icon === "password"
          ? Lock
          : icon === "user"
            ? User
            : null;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {IconComponent && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <IconComponent className="w-5 h-5" />
            </div>
          )}
          <input
            ref={ref}
            type={inputType}
            className={`
              w-full border
              ${IconComponent ? "pl-12" : "pl-4"}
              ${isPasswordField ? "pr-12" : "pr-4"}
              py-3.5
              ${variant === "light" ? "rounded-full bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-primary-500" : "rounded-xl bg-gray-800 text-white placeholder-gray-400 border-gray-700 focus:ring-primary-500"}
              focus:outline-none focus:ring-2 focus:border-transparent
              transition-all duration-200
              ${error ? (variant === "light" ? "border-red-500 focus:ring-red-500" : "border-red-500 focus:ring-red-500") : ""}
              ${className}
            `}
            {...props}
          />
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors ${variant === "light" ? "text-gray-400 hover:text-gray-500" : "text-gray-400 hover:text-gray-300"}`}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
