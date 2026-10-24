"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Script from "next/script";
import { NEXT_PUBLIC_GOOGLE_CLIENT_ID } from "@/config/env";
import {
  getGoogleRelayOrigin,
  isRelayMessage,
  newRelayState,
  relayUrl,
} from "@/lib/auth/googleRelay";

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              shape?: "rectangular" | "pill";
              /** GIS only accepts a pixel number here (max 400) — a percentage is silently ignored. */
              width?: number;
              text?: "signin_with" | "signup_with" | "continue_with";
            }
          ) => void;
        };
      };
    };
  }
}

type ButtonText = "signin_with" | "signup_with" | "continue_with";

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  text?: ButtonText;
  disabled?: boolean;
}

/** GIS caps the rendered button at 400px regardless of what's requested. */
const GIS_MAX_WIDTH = 400;
/** Matches the wrapper's `p-0.5` (2px each side) so the button fits inside the purple frame exactly. */
const WRAPPER_PADDING_PX = 2;

/** What GIS writes on the same three button variants. */
const LABELS: Record<ButtonText, string> = {
  signin_with: "Sign in with Google",
  signup_with: "Sign up with Google",
  continue_with: "Continue with Google",
};

/** One name, so a second click navigates the open popup instead of stacking another. */
const RELAY_WINDOW_NAME = "google-relay";
const POPUP_WIDTH = 460;
const POPUP_HEIGHT = 640;

function frameClass(disabled: boolean) {
  return `w-full flex justify-center overflow-hidden rounded-full border border-primary-400 bg-primary-50 p-0.5 ${disabled ? "pointer-events-none opacity-50" : ""}`;
}

function popupFeatures() {
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2));
  return `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`;
}

// The page's origin never changes, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * Google's own button where this origin is registered with Google (the apex,
 * localhost); on a tournament subdomain, a lookalike that runs sign-in in a
 * popup on the apex instead (src/lib/auth/googleRelay.ts). Callers see the
 * same `onCredential(idToken)` either way.
 */
export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  // undefined while server rendering, where the host isn't known yet.
  const relayOrigin = useSyncExternalStore<string | null | undefined>(
    subscribe,
    () => getGoogleRelayOrigin(window.location.origin),
    () => undefined,
  );

  if (!NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  if (relayOrigin === undefined) {
    return (
      <div className={frameClass(props.disabled ?? false)}>
        <div className="h-10" />
      </div>
    );
  }

  return relayOrigin ? (
    <RelayGoogleButton {...props} relayOrigin={relayOrigin} />
  ) : (
    <DirectGoogleButton {...props} />
  );
}

function DirectGoogleButton({
  onCredential,
  text = "continue_with",
  disabled = false,
}: GoogleSignInButtonProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (disabled) return;

    let cancelled = false;

    const render = () => {
      if (cancelled || !window.google || !buttonRef.current || !wrapperRef.current) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: Math.min(
          GIS_MAX_WIDTH,
          Math.round(wrapperRef.current.clientWidth) - WRAPPER_PADDING_PX * 2,
        ),
        text,
      });
    };

    let resizeObserver: ResizeObserver | undefined;

    if (window.google) {
      render();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          render();
        }
      }, 100);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    // Re-render on layout changes (viewport resize, card reflow) so the
    // button keeps matching the form width instead of the size it was
    // mounted at.
    if (wrapperRef.current) {
      resizeObserver = new ResizeObserver(() => render());
      resizeObserver.observe(wrapperRef.current);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [text, disabled]);

  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      <div ref={wrapperRef} className={frameClass(disabled)}>
        <div ref={buttonRef} className="rounded-full overflow-hidden" />
      </div>
    </>
  );
}

function RelayGoogleButton({
  onCredential,
  text = "continue_with",
  disabled = false,
  relayOrigin,
}: GoogleSignInButtonProps & { relayOrigin: string }) {
  const onCredentialRef = useRef(onCredential);
  const stopRef = useRef<((closePopup: boolean) => void) | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  // Leaving the page mid-sign-in closes its popup too.
  useEffect(() => () => stopRef.current?.(true), []);

  const start = () => {
    // Only the earlier attempt's listener goes. Closing its popup here and
    // then reopening the same window name could hand back the closing window.
    stopRef.current?.(false);
    const state = newRelayState();
    // Opened before anything async, so the browser counts it as this click's popup.
    const popup = window.open(
      relayUrl(relayOrigin, window.location.origin, state),
      RELAY_WINDOW_NAME,
      popupFeatures(),
    );
    if (!popup) {
      setBlocked(true);
      return;
    }
    setBlocked(false);

    function onMessage(event: MessageEvent) {
      if (event.origin !== relayOrigin || event.source !== popup) return;
      if (!isRelayMessage(event.data, state)) return;
      stop(false);
      onCredentialRef.current(event.data.idToken);
    }

    // Closing the popup without signing in just ends the attempt.
    const poll = window.setInterval(() => {
      if (popup.closed) stop(false);
    }, 500);

    function stop(closePopup: boolean) {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      if (closePopup && popup && !popup.closed) popup.close();
      stopRef.current = null;
    }

    window.addEventListener("message", onMessage);
    stopRef.current = stop;
  };

  return (
    <div className="w-full">
      <div className={frameClass(disabled)}>
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="flex h-10 w-full max-w-[400px] items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <Image src="/google-g.svg" alt="" width={18} height={18} aria-hidden />
          {LABELS[text]}
        </button>
      </div>
      {blocked && (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          Your browser blocked the Google window. Allow pop-ups for this site
          and try again.
        </p>
      )}
    </div>
  );
}
