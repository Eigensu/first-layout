import * as React from "react";

// Loading Skeleton Component
interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
}

const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  variant = "rectangular",
}) => {
  const baseClasses = "animate-pulse bg-gray-200";

  const variantClasses = {
    text: "h-4 w-full rounded",
    circular: "rounded-full",
    rectangular: "rounded-lg",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} />
  );
};

// Loading Spinner Component
interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <div className="animate-spin rounded-full border-2 border-gray-300 border-t-primary-600 h-full w-full"></div>
    </div>
  );
};

// Page Loading Component
const PageLoader: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <Spinner size="lg" className="mb-4 mx-auto" />
      <p className="text-gray-600">Loading WalleFantasy...</p>
    </div>
  </div>
);

// Card Skeleton for Player/Team Cards
const CardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl p-6 shadow-soft">
    <div className="flex items-center space-x-3 mb-4">
      <Skeleton variant="circular" className="w-12 h-12" />
      <div className="flex-1">
        <Skeleton variant="text" className="w-3/4 mb-2" />
        <Skeleton variant="text" className="w-1/2" />
      </div>
    </div>
    <div className="space-y-2">
      <Skeleton variant="text" className="w-full" />
      <Skeleton variant="text" className="w-2/3" />
    </div>
  </div>
);

export { Skeleton, Spinner, PageLoader, CardSkeleton };
