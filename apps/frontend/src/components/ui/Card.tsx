import * as React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glassmorphism?: boolean;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({
  children,
  className = "",
  hover = false,
  glassmorphism = false,
  onClick,
}) => {
  const baseClasses = "rounded-2xl transition-all duration-300";
  const hoverClasses = hover
    ? "hover:shadow-large hover:-translate-y-1 cursor-pointer"
    : "";
  const glassClasses = glassmorphism
    ? "bg-white/10 backdrop-blur-md border border-border-subtle/50"
    : "bg-bg-card shadow-pink-soft border border-border-subtle";

  return (
    <div
      className={`${baseClasses} ${glassClasses} ${hoverClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

const CardHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`p-6 pb-4 ${className}`}>{children}</div>
);

const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => <div className={`p-6 pt-2 ${className}`}>{children}</div>;

const CardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <div className={`p-6 pt-4 border-t border-border-subtle ${className}`}>
    {children}
  </div>
);

export { Card, CardHeader, CardBody, CardFooter };
