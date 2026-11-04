"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/Loading";
import { MobileNumberGate } from "./MobileNumberGate";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return <MobileNumberGate>{children}</MobileNumberGate>;
}
