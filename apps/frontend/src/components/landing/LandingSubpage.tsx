import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LandingFooter } from "./LandingFooter";

/** The frame of the root domain's inner pages: contact and the legal pages. */
export function LandingSubpage({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col bg-bg-body text-text-main">
      <header className="bg-bg-elevated border-b border-border-subtle sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/walle-logo.png"
              alt="WALL-E Arena Logo"
              width={48}
              height={48}
              className="object-contain"
            />
            <div>
              <p className="text-2xl font-bold text-text-main">WALL-E Arena</p>
              <p className="text-text-muted text-sm">Tournaments</p>
            </div>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {children}

      <LandingFooter />
    </main>
  );
}
