"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Trophy,
  Users,
  Star,
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  Settings,
  LogOut,
  Info,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export interface PillNavItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface PillNavbarProps {
  items?: PillNavItem[];
  activeId?: string;
  className?: string;
  mobileMenuContent?: React.ReactNode; // Content to show at bottom of mobile menu
}

const DEFAULT_ITEMS: PillNavItem[] = [
  { id: "home", label: "Home", href: "/", icon: <Home className="w-4 h-4" /> },
  {
    id: "leaderboard",
    label: "Leaderboard",
    href: "/leaderboard",
    icon: <Trophy className="w-4 h-4" />,
  },
  {
    id: "my-team",
    label: "My Team",
    href: "/demo",
    icon: <Users className="w-4 h-4" />,
  },
  {
    id: "sponsors",
    label: "Sponsors",
    href: "/sponsors",
    icon: <Star className="w-4 h-4" />,
  },
  {
    id: "about",
    label: "About",
    href: "/about",
    icon: <Info className="w-4 h-4" />,
  },
];

const PillNavbar: React.FC<PillNavbarProps> = ({
  items = DEFAULT_ITEMS,
  activeId,
  className = "",
  mobileMenuContent,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const { isAuthenticated, logout } = useAuth();
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  const currentActiveId = React.useMemo(() => {
    if (activeId) return activeId;
    const match = items.find((it) => it.href === pathname);
    return match?.id;
  }, [activeId, items, pathname]);

  // Lock body scroll when mobile menu is open
  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  // Handle scroll to shrink navbar
  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close user menu when clicking outside
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleNavigation = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 mx-auto px-2 sm:px-4 pt-4 transition-all duration-300 ${className}`}
        style={{ maxWidth: isScrolled ? "900px" : "1280px" }}
      >
        {/* Desktop Navigation */}
        <div className="hidden md:flex bg-[#f9f7f3] rounded-full shadow-md border border-gray-200 p-1.5 items-center justify-between gap-1 transition-all duration-300">
          {/* Left side: Logo and Nav Items */}
          <div className="flex items-center gap-1">
            {/* Logo */}
            <div className="flex items-center pl-2 pr-3">
              <Image
                src="/logo.jpeg"
                alt="Wall-E Arena Logo"
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            </div>
            {items.map((item) => {
              const isActive = item.id === currentActiveId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    flex items-center justify-center space-x-1.5 rounded-full font-medium transition-all duration-300 whitespace-nowrap
                    ${isScrolled ? "px-4 py-2" : "px-6 py-2.5"}
                    ${
                      isActive
                        ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  {item.icon && (
                    <span className={isActive ? "text-white" : "text-gray-500"}>
                      {item.icon}
                    </span>
                  )}
                  <span className="text-sm">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right side: User Menu or Join Button */}
          <div className="pr-2">
            {isAuthenticated ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium shadow-sm hover:bg-gray-50 transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm shadow">
                    U
                  </div>
                  <span className="text-gray-700">Account</span>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg z-50"
                  >
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/dashboard");
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LayoutDashboard className="h-4 w-4 text-primary-600" />
                      <span>Dashboard</span>
                    </div>
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/admin");
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Settings className="h-4 w-4 text-primary-600" />
                      <span>Admin</span>
                    </div>
                    <div className="my-1 h-px bg-gray-100" />
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Log Out</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-[0_0_20px_rgba(191,171,121,0.35)] transition"
              >
                Join Us
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Navigation Header */}
        <div className="md:hidden bg-[#f9f7f3] rounded-2xl shadow-md border border-gray-200">
          <div className="flex items-center justify-between p-3">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <Image
                src="/logo.jpeg"
                alt="Wall-E Arena Logo"
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
              <span className="font-semibold text-gray-900 text-sm">
                Wall-E Arena
              </span>
            </div>{" "}
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors z-50 relative"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-600" />
              ) : (
                <Menu className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Side Menu Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.jpeg"
              alt="Wall-E Arena Logo"
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
            <span className="font-semibold text-gray-900">Wall-E Arena</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Menu Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)] p-4">
          <div className="space-y-1">
            {items.map((item) => {
              const isActive = item.id === currentActiveId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all
                    ${
                      isActive
                        ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }
                  `}
                >
                  {item.icon && (
                    <span className={isActive ? "text-white" : "text-gray-500"}>
                      {item.icon}
                    </span>
                  )}
                  <span className="text-sm">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Additional mobile menu content (e.g., UserMenu) */}
          {mobileMenuContent && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              {mobileMenuContent}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export { PillNavbar };
export type { PillNavbarProps };
