import Image from "next/image";
import Link from "next/link";
import { AppDownloadBanner } from "@/components/navigation/AppDownloadBanner";
import { AppDownloadTicker } from "@/components/navigation/AppDownloadTicker";
import { SUPPORT_EMAIL, SUPPORT_HOURS } from "./content";

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-bg-elevated border-t border-border-subtle mt-auto">
      <AppDownloadTicker />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <AppDownloadBanner />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/walle-logo.png"
                alt="Wall-E Arena Logo"
                width={40}
                height={40}
                className="object-contain"
              />
              <span className="text-xl font-bold text-text-main">Wall-E Arena</span>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              Your premier destination for fantasy gaming tournaments. Experience
              competitive gaming like never before.
            </p>
            <p className="text-text-subtle text-xs mt-3">
              Developed by Eigensu Business Solutions
            </p>
          </div>

          <div>
            <h3 className="text-text-main font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-text-muted hover:text-text-main transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-text-muted hover:text-text-main transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-text-main font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy-policy" className="text-text-muted hover:text-text-main transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms-and-conditions" className="text-text-muted hover:text-text-main transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-text-main font-semibold mb-4">Contact</h3>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>
                <span className="block">Email:</span>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-text-main transition-colors">
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <span className="block mt-2">Support Hours:</span>
                <span>{SUPPORT_HOURS}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border-subtle pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-text-subtle text-sm">
            © {year} Wall-E Arena. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/privacy-policy" className="text-text-subtle hover:text-text-main transition-colors">
              Privacy
            </Link>
            <Link href="/terms-and-conditions" className="text-text-subtle hover:text-text-main transition-colors">
              Terms
            </Link>
            <Link href="/contact" className="text-text-subtle hover:text-text-main transition-colors">
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
