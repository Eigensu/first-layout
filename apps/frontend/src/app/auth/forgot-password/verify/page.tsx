"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NEXT_PUBLIC_API_URL } from "@/config/env";
import Image from "next/image";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordVerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = params.get("phone") || "";
    setPhone(p);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${NEXT_PUBLIC_API_URL}/api/auth/forgot-password/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, otp }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Invalid OTP");
      }
      const resetToken = data.reset_token as string;
      const url = new URLSearchParams({ token: resetToken });
      router.push(`/auth/forgot-password/reset?${url.toString()}`);
    } catch (err: any) {
      setError(err.message || "Verification failed");
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
        <p className="text-gray-600">Verify OTP</p>
      </div>

      <div className="bg-bg-card rounded-3xl p-6 sm:p-8 shadow-pink-soft">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            type="tel"
            value={phone}
            readOnly
            icon="phone"
            variant="light"
          />
          <Input
            type="text"
            placeholder="Enter OTP"
            icon="password"
            variant="light"
            value={otp}
            onChange={(e: any) => setOtp(e.target.value)}
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
            disabled={loading}
          >
            {loading ? "Verifying..." : "Verify"}
          </Button>
        </form>
      </div>
    </div>
  );
}
