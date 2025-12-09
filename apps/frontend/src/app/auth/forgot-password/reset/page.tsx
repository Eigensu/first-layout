"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NEXT_PUBLIC_API_URL } from "@/config/env";
import Image from "next/image";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordResetPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setToken(params.get("token") || "");
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `${NEXT_PUBLIC_API_URL}/api/auth/forgot-password/reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset_token: token, new_password: password }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Reset failed");
      }
      setMessage("Password updated. You can now log in.");
      setTimeout(() => router.push("/auth/login"), 1000);
    } catch (err: any) {
      setError(err.message || "Reset failed");
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
        <p className="text-text-muted">Set a new password</p>
      </div>

      <div className="bg-bg-card rounded-3xl p-6 sm:p-8 shadow-pink-soft">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter new password"
            icon="password"
            variant="light"
            value={password}
            onChange={(e: any) => setPassword(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            icon="password"
            variant="light"
            value={confirm}
            onChange={(e: any) => setConfirm(e.target.value)}
            required
          />
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
          <Button
            type="submit"
            className="w-full bg-gradient-primary text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            disabled={loading || !token}
          >
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
