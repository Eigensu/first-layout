"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Phone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api/auth";
import { getErrorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "./Input";
import { GOOGLE_RELAY_PATH } from "@/lib/auth/googleRelay";

/** The rule the web signup form applies, so both ways in store the same shape. */
export function parseMobile(value: string): { digits: string } | { error: string } {
  const trimmed = value.trim();
  if (trimmed.includes("+") || trimmed.startsWith("00")) {
    return { error: "Do not include country code. Enter 10-digit mobile number" };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) return { error: "Enter a valid 10-digit mobile number" };
  return { digits };
}

/**
 * Blocking prompt for the one detail Google sign-in can't give us: a mobile
 * number. The web counterpart of the app's MobileNumberGate. It goes by the
 * account rather than by the sign-up moment, so a reload can't skip it.
 */
export function MobileNumberGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);

  // The sign-in popup a tournament subdomain opens on the apex shares the
  // apex's session, and covering it would block signing in on the subdomain.
  const needsMobile =
    !!user && !user.mobile && !pathname?.startsWith(GOOGLE_RELAY_PATH);

  // aria-modal only informs screen readers; this is what stops Tab and clicks
  // reaching the page behind. The DOM property, not a JSX prop, because React
  // 18 and 19 read a JSX `inert` differently.
  useEffect(() => {
    if (pageRef.current) pageRef.current.inert = needsMobile;
  }, [needsMobile]);

  return (
    <>
      <div ref={pageRef}>{children}</div>
      {needsMobile && <MobileNumberDialog />}
    </>
  );
}

function MobileNumberDialog() {
  const { logout, updateUser } = useAuth();
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseMobile(mobile);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      updateUser(await authApi.updateMobile(parsed.digits));
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-card-soft text-accent-pink-soft">
          <Phone className="h-6 w-6" aria-hidden />
        </div>
        <h2 id="mobile-gate-title" className="text-xl font-bold text-text-main">
          Add your mobile number
        </h2>
        <p className="mb-4 mt-1.5 text-sm text-text-muted">
          We need it to verify your account and reach you about contests and
          prizes. It&apos;s a one-time step.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <Input
            variant="light"
            icon="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-label="Mobile number"
            placeholder="Enter your mobile number"
            value={mobile}
            onChange={(e) => {
              setMobile(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            disabled={saving}
            autoFocus
          />
          <Button
            type="submit"
            className="mt-4 w-full rounded-full bg-gradient-primary py-3.5 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
        </form>

        {/* Escape hatch so someone who doesn't want to share it isn't stuck. */}
        <button
          type="button"
          onClick={() => logout()}
          disabled={saving}
          className="mt-3 w-full py-2 text-sm text-text-muted hover:text-text-main disabled:opacity-50"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
