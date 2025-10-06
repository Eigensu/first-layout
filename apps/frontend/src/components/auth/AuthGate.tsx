"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/Loading";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthRoute = pathname?.startsWith("/auth");
  const isPublicHome = pathname === "/"; // Home is public (landing)

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isAuthRoute && !isPublicHome) {
        router.replace("/auth/login");
      }
    }
  }, [isAuthenticated, isLoading, isAuthRoute, isPublicHome, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated && !isAuthRoute && !isPublicHome) {
    // Prevent flashing of protected content
    return null;
  }

  return <>{children}</>
};
