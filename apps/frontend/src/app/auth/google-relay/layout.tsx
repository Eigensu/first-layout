import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in with Google - Wall-E Arena",
  robots: { index: false, follow: false },
};

export default function GoogleRelayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
