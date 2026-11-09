"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import type { User } from "@/types/auth";
import {
  finishEmailChange,
  minutes,
  passwordHint,
  startEmailChange,
  type ChangeEmailState,
} from "./changeEmail";

type ChangeEmailSectionProps = Readonly<{
  currentEmail?: string | null;
  authProvider?: string;
  onChanged: (user: User) => void;
  // Which step to open on; the page always starts at the form.
  initialState?: ChangeEmailState;
}>;

const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent-pink-500";
const BUTTON_CLASS =
  "w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed";

export function ChangeEmailSection({
  currentEmail,
  authProvider,
  onChanged,
  initialState = { step: "form" },
}: ChangeEmailSectionProps) {
  const [state, setState] = useState<ChangeEmailState>(initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const outcome = await startEmailChange(email, password, currentEmail);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setPassword("");
    setOtp("");
    setState(outcome.value);
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.step !== "code") return;
    setError(null);
    setBusy(true);
    const outcome = await finishEmailChange(otp);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    onChanged(outcome.value);
    setEmail("");
    setState({ step: "done", email: outcome.value.email });
  }

  function restart() {
    setError(null);
    setOtp("");
    setState({ step: "form" });
  }

  const hint = passwordHint(authProvider);

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-bg-card shadow-lg p-4 sm:p-7">
      <h2 className="text-lg sm:text-xl font-black text-text-main flex items-center gap-2 mb-3 sm:mb-4">
        <Mail className="h-5 w-5 text-accent-pink-500" />
        Security: Change Email
      </h2>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-danger-edge bg-danger-tonal px-3 py-2 text-xs sm:text-sm text-danger"
        >
          {error}
        </div>
      )}

      {state.step === "form" && (
        <form onSubmit={onRequest} className="space-y-4">
          <p className="text-xs sm:text-sm text-text-muted">
            Your email signs you in and can reset your password. We&apos;ll
            send a code to the new address to make sure it&apos;s yours.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-text-muted">
                New Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-text-muted">
                Current Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
                autoComplete="current-password"
              />
            </label>
          </div>
          {hint && (
            <div className="rounded-xl bg-bg-elevated px-3 py-2 text-[11px] sm:text-xs text-text-muted leading-relaxed">
              {hint}
            </div>
          )}
          <button type="submit" disabled={busy} className={BUTTON_CLASS}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Sending Code..." : "Send Code"}
          </button>
        </form>
      )}

      {state.step === "code" && (
        <form onSubmit={onConfirm} className="space-y-4">
          <p className="text-xs sm:text-sm text-text-muted">
            We sent a code to <strong>{state.email}</strong>. It expires in{" "}
            {minutes(state.expiresInSec)}. Check spam if it isn&apos;t there.
          </p>
          <label className="block md:max-w-xs">
            <span className="text-xs uppercase tracking-wide text-text-muted">
              Code
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="submit" disabled={busy} className={BUTTON_CLASS}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Confirming..." : "Confirm Email"}
            </button>
            <button
              type="button"
              onClick={restart}
              disabled={busy}
              className="w-full sm:w-auto rounded-xl border border-border-strong px-4 py-2.5 text-sm font-semibold text-text-main hover:bg-bg-card-soft"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      {state.step === "done" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-success-edge bg-success-tonal px-3 py-2 text-xs sm:text-sm text-success">
            Your email is now <strong>{state.email}</strong>. Use it to sign in
            and to reset your password.
          </div>
          <button
            type="button"
            onClick={restart}
            className="w-full sm:w-auto rounded-xl border border-border-strong px-4 py-2.5 text-sm font-semibold text-text-main hover:bg-bg-card-soft"
          >
            Change it again
          </button>
        </div>
      )}
    </div>
  );
}
