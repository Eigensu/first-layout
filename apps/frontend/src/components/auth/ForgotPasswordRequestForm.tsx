"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { Input } from "@/components/auth/Input";
import { Button } from "@/components/ui/Button";
import {
  defaultChannel,
  type ResetChannel,
  type ResetChannels,
} from "@/lib/api/emailCodes";
import {
  CHANNEL_LABELS,
  requestButtonLabel,
  sendResetCode,
} from "./forgotPassword";

type ForgotPasswordRequestFormProps = Readonly<{
  channels: ResetChannels;
  onSent: (next: string) => void;
}>;

/** Ask for a reset code by whichever channels this site can send on. */
export function ForgotPasswordRequestForm({
  channels,
  onSent,
}: ForgotPasswordRequestFormProps) {
  const [channel, setChannel] = useState<ResetChannel | null>(
    defaultChannel(channels),
  );
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (channel === null) {
    return (
      <p className="text-center text-sm text-text-muted">
        Password reset isn&apos;t available on this site right now. Please
        contact the tournament organisers.
      </p>
    );
  }

  function choose(next: ResetChannel) {
    setChannel(next);
    setValue("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channel) return;
    setLoading(true);
    setError(null);
    const result = await sendResetCode(channel, value);
    setLoading(false);
    if (result.ok) {
      posthog.capture("password_reset_requested", { channel });
      onSent(result.next);
    } else setError(result.error);
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setValue(e.target.value);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {channels.sms && channels.email && (
        <div
          role="radiogroup"
          aria-label="Send the code by"
          className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1"
        >
          {(["sms", "email"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={channel === option}
              onClick={() => choose(option)}
              className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                channel === option
                  ? "bg-white text-slate-900 shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {CHANNEL_LABELS[option]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {channel === "email" ? (
        <Input
          type="email"
          placeholder="The email on your account"
          icon="email"
          variant="light"
          value={value}
          onChange={onChange}
          autoComplete="email"
          required
        />
      ) : (
        <Input
          type="tel"
          placeholder="e.g. +91XXXXXXXXXX"
          icon="phone"
          variant="light"
          value={value}
          onChange={onChange}
          autoComplete="tel"
          required
        />
      )}

      <Button
        type="submit"
        className="w-full bg-gradient-primary text-white font-semibold py-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
        disabled={loading}
      >
        {requestButtonLabel(channel, loading)}
      </Button>
    </form>
  );
}
