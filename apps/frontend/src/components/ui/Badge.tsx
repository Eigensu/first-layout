import * as React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "error"
    | "neutral";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "md",
  className = "",
}) => {
  const baseClasses =
    "inline-flex items-center justify-center rounded-full font-medium";

  const variantClasses = {
    primary: "bg-primary-100 text-primary-800 border border-primary-200",
    secondary:
      "bg-secondary-100 text-secondary-800 border border-secondary-200",
    success: "bg-success-100 text-success-800 border border-success-200",
    warning: "bg-warning-100 text-warning-800 border border-warning-200",
    error: "bg-error-100 text-error-800 border border-error-200",
    neutral: "bg-gray-100 text-gray-800 border border-gray-200",
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs h-5",
    md: "px-2.5 py-1 text-sm h-6",
    lg: "px-3 py-1.5 text-base h-8",
  };

  return (
    <span
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
};

export { Badge };
