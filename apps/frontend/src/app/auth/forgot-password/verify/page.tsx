"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ForgotPasswordVerifyForm } from "@/components/auth/ForgotPasswordVerifyForm";
import { verifyPrompt } from "@/components/auth/forgotPassword";
import {
  destinationChannel,
  destinationFromQuery,
  type ResetDestination,
} from "@/lib/api/emailCodes";

export default function ForgotPasswordVerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [destination, setDestination] = useState<ResetDestination | null>(
    null,
  );

  useEffect(() => {
    setDestination(destinationFromQuery(params));
  }, [params]);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-10">
      {/* Header to match login */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl shadow-lg overflow-hidden">
            <Image
              src="/logo.jpeg"
              alt="WALL-E Arena Logo"
              width={64}
              height={64}
              className="object-cover"
            />
          </div>
          <h1 className="text-4xl font-extrabold bg-gradient-primary bg-clip-text text-transparent">
            WALL-E Arena
          </h1>
        </div>
        <p className="text-text-muted">
          {verifyPrompt(destination ? destinationChannel(destination) : "sms")}
        </p>
      </div>

      <div className="bg-bg-card rounded-3xl p-6 sm:p-8 shadow-pink-soft">
        <ForgotPasswordVerifyForm
          destination={destination}
          onVerified={(next) => router.push(next)}
        />
      </div>
    </div>
  );
}
