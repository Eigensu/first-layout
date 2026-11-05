"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";

// "/#..." rather than "#..." so the links also work from /contact and the
// legal pages.
const NAV_LINKS = [
  { href: "/#tournaments", label: "Tournaments" },
  { href: "/#features", label: "Features" },
];

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  // The whole header, toggle included: were the toggle outside it, its
  // mousedown would close the menu and the click that follows reopen it.
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pt-4 px-4 sm:px-6 md:pt-6 pointer-events-none flex justify-center">
      <header
        ref={headerRef}
        className="pointer-events-auto w-full max-w-7xl bg-bg-elevated backdrop-blur-lg border border-border-subtle rounded-full shadow-pink-soft"
      >
        <div className="px-5 sm:px-8 py-3 sm:py-4 flex justify-between items-center relative">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/walle-logo.png"
              alt="Wall-E Arena Logo"
              width={40}
              height={40}
              className="object-contain rounded-full"
            />
            <span className="text-lg sm:text-xl font-bold text-text-main tracking-wide">
              Wall-E Arena
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-text-muted hover:text-text-main transition-colors text-sm font-medium py-2"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/contact"
              className="bg-gradient-button-primary text-text-main font-semibold px-6 py-2.5 rounded-full transition-transform hover:scale-105 text-sm ml-4"
            >
              Contact Us
            </Link>
          </nav>

          <button
            className="md:hidden p-2 text-text-muted hover:text-text-main transition-colors"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <div
          className={`absolute top-full left-0 right-0 mt-3 md:hidden transition-all duration-300 ${
            open ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-4 invisible"
          }`}
        >
          <div className="bg-bg-elevated border border-border-subtle rounded-3xl p-6 mx-2 flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-main hover:bg-bg-card px-4 py-3 rounded-xl transition-colors text-base font-medium"
              >
                {link.label}
              </a>
            ))}
            <div className="h-px w-full bg-border-subtle my-2" />
            <Link
              href="/contact"
              onClick={() => setOpen(false)}
              className="bg-gradient-button-primary text-text-main font-semibold px-6 py-3.5 rounded-xl text-center"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}
