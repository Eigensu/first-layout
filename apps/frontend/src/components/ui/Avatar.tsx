import * as React from "react";
import Image from "next/image";
import { API_BASE_URL } from "@/common/consts";

interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Optional override for background gradient classes when no src is provided */
  gradientClassName?: string;
}

const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = "md",
  className = "",
  gradientClassName,
}) => {
  const [errored, setErrored] = React.useState(false);
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const getGradient = (name: string): string => {
    const gradients = [
      "bg-gradient-to-br from-primary-400 to-primary-600",
      "bg-gradient-to-br from-primary-300 to-accent-500",
      "bg-gradient-to-br from-blue-400 to-indigo-600",
      "bg-gradient-to-br from-emerald-400 to-teal-600",
      "bg-gradient-to-br from-purple-400 to-pink-600",
      "bg-gradient-to-br from-indigo-400 to-primary-500",
    ];

    const hash = name.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return gradients[Math.abs(hash) % gradients.length];
  };

  const sizeClasses = {
    sm: "w-6 h-6 sm:w-8 sm:h-8 text-xs sm:text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
    xl: "w-16 h-16 text-xl",
  };

  const baseClasses =
    "rounded-full flex items-center justify-center text-white font-bold";

  // Build absolute src if backend returned a relative API path
  const resolvedSrc =
    src && src.startsWith("/api") ? `${API_BASE_URL}${src}` : src;

  if (resolvedSrc && !errored) {
    return (
      <div
        className={`${baseClasses} ${sizeClasses[size]} ${className} relative overflow-hidden`}
      >
        <Image
          src={resolvedSrc}
          alt={name}
          fill
          className="object-cover object-center"
          unoptimized
          onError={() => setErrored(true)}
          priority
        />
      </div>
    );
  }

  const bgClass = gradientClassName || getGradient(name);

  return (
    <div
      className={`${baseClasses} ${bgClass} ${sizeClasses[size]} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};

export { Avatar };
