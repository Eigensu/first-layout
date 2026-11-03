"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/ui/Button";
import {
  destinationChannel,
  destinationValue,
  type ResetDestination,
} from "@/lib/api/emailCodes";
import { checkResetCode } from "./forgotPassword";

type ForgotPasswordVerifyFormProps = Readonly<{
  destination: ResetDestination | null;
  onVerified: (next: string) => void;
}>;

/** Trade the code for a reset token. */
export function ForgotPasswordVerifyForm({
  destination,
  onVerified,
}: ForgotPasswordVerifyFormProps) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byEmail = destination
    ? destinationChannel(destination) === "email"
    : false;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destination) return;
    setLoading(true);
    setError(null);
    const result = await checkResetCode(destination, otp);
    setLoading(false);
    if (result.ok) onVerified(result.next);
    else setError(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        type={byEmail ? "email" : "tel"}
        value={destination ? destinationValue(destination) : ""}
        readOnly
        icon={byEmail ? "email" : "phone"}
        variant="light"
      />
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={byEmail ? "6-digit code" : "Enter OTP"}
        icon="password"
        variant="light"
        value={otp}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setOtp(e.target.value)
        }
        required
      />
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      <Button
        type="submit"
        className="w-full bg-gradient-primary text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
        disabled={loading || !destination}
      >
        {loading ? "Verifying..." : "Verify"}
      </Button>
      <p className="text-center text-sm text-text-muted">
        <Link href="/auth/forgot-password" className="underline">
          Send a new code
        </Link>
      </p>
    </form>
  );
}
