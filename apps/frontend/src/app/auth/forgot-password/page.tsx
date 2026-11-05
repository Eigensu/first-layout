"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ForgotPasswordRequestForm } from "@/components/auth/ForgotPasswordRequestForm";
import { getResetChannels, type ResetChannels } from "@/lib/api/emailCodes";

export default function ForgotPasswordRequestPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<ResetChannels | null>(null);

  useEffect(() => {
    let active = true;
    getResetChannels().then((found) => {
      if (active) setChannels(found);
    });
    return () => {
      active = false;
    };
  }, []);

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
        {channels ? (
          <ForgotPasswordRequestForm
            channels={channels}
            onSent={(next) => router.push(next)}
          />
        ) : (
          <p className="text-center text-sm text-text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
