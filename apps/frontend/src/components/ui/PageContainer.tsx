import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * A consistent page container that provides:
 * - Proper max-width constraints (max-w-screen-xl = 1280px)
 * - Horizontal padding that scales with screen size
 * - Centered content with mx-auto
 * - Overflow protection to prevent horizontal scroll
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "container mx-auto px-4 sm:px-6 max-w-screen-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

interface PageSectionProps {
  children: ReactNode;
  className?: string;
  /** Whether to add horizontal margin (mx-4) for full-bleed rounded sections */
  fullBleed?: boolean;
}

/**
 * A section wrapper that provides consistent spacing and optional full-bleed styling.
 * Use fullBleed={true} for sections with rounded corners that need margin from screen edges.
 * For full-width hero elements, use HeroSection component instead.
 */
export function PageSection({
  children,
  className,
  fullBleed = false,
}: PageSectionProps) {
  return (
    <section className={cn(fullBleed && "mx-4", className)}>{children}</section>
  );
}
