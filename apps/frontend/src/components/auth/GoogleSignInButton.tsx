"use client";

import React, { useEffect, useRef } from "react";
import Script from "next/script";
import { NEXT_PUBLIC_GOOGLE_CLIENT_ID } from "@/config/env";

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

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
  disabled?: boolean;
}

/** GIS caps the rendered button at 400px regardless of what's requested. */
const GIS_MAX_WIDTH = 400;
/** Matches the wrapper's `p-0.5` (2px each side) so the button fits inside the purple frame exactly. */
const WRAPPER_PADDING_PX = 2;

export function GoogleSignInButton({
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
    if (!NEXT_PUBLIC_GOOGLE_CLIENT_ID || disabled) return;

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

  if (!NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      <div
        ref={wrapperRef}
        className={`w-full flex justify-center overflow-hidden rounded-full border border-primary-400 bg-primary-50 p-0.5 ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <div ref={buttonRef} className="rounded-full overflow-hidden" />
      </div>
    </>
  );
}
