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
    primary: "bg-bg-card-soft text-accent-pink-50 border border-border-strong",
    secondary: "bg-bg-chip text-text-main border border-border-strong",
    success: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
    warning: "bg-amber-500/20 text-amber-300 border border-amber-400/40",
    error: "bg-red-500/20 text-red-300 border border-red-400/40",
    neutral: "bg-bg-elevated text-text-muted border border-border-subtle",
  };

  const sizeClasses = {
    sm: "px-1.5 sm:px-2 py-0 sm:py-0.5 text-[10px] sm:text-xs h-4 sm:h-5",
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
