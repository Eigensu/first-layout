import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      disabled,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const baseClasses =
      "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variantClasses = {
      primary:
        "bg-gradient-primary text-white hover:shadow-glow focus:ring-primary-500 shadow-md hover:shadow-lg",
      secondary:
        "bg-gradient-secondary text-white hover:shadow-medium focus:ring-secondary-500 shadow-md hover:shadow-lg",
      ghost: "text-gray-700 hover:bg-gray-100 focus:ring-gray-500",
      outline:
        "border-2 border-primary-400 text-primary-600 hover:bg-primary-50 focus:ring-primary-500",
      destructive:
        "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-md hover:shadow-lg",
    };

    const sizeClasses = {
      sm: "px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm h-7 sm:h-8",
      md: "px-4 py-2 text-base h-10",
      lg: "px-6 py-3 text-lg h-12",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
