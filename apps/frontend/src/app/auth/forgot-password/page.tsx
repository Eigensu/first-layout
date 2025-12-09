"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NEXT_PUBLIC_API_URL } from "@/config/env";
import Image from "next/image";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordRequestPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `${NEXT_PUBLIC_API_URL}/api/auth/forgot-password/request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }
      );
      // Always generic
      if (!res.ok) {
        // Still proceed to verify to avoid enumeration UX differences
      }
      setMessage("If the phone exists, an OTP has been sent.");
      const params = new URLSearchParams({ phone });
      router.push(`/auth/forgot-password/verify?${params.toString()}`);
    } catch (err: any) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-10">
      {/* Header to match login */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg overflow-hidden">
            <Image
              src="/logo.jpeg"
              alt="Wall-E Arena Logo"
              width={64}
              height={64}
              className="object-cover"
            />
          </div>
          <h1 className="text-4xl font-extrabold bg-gradient-primary bg-clip-text text-transparent">
            Wall-E Arena
          </h1>
        </div>
        <p className="text-text-muted">Reset your password</p>
      </div>

      <div className="bg-bg-card rounded-3xl p-6 sm:p-8 shadow-pink-soft">
        <form onSubmit={onSubmit} className="space-y-4">
          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <Input
            type="tel"
            placeholder="e.g. +91XXXXXXXXXX"
            icon="phone"
            variant="light"
            value={phone}
            onChange={(e: any) => setPhone(e.target.value)}
            required
          />

          <Button
            type="submit"
            className="w-full bg-gradient-primary text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send OTP"}
          </Button>
        </form>
      </div>
    </div>
  );
}
