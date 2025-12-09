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
import { Avatar } from "@/components/ui/Avatar";

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
  {
    id: "home",
    label: "Home",
    href: "/home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    id: "contests",
    label: "Contests",
    href: "/contests",
    icon: <Trophy className="w-4 h-4" />,
  },
  {
    id: "my-teams",
    label: "My Teams",
    href: "/teams",
    icon: <Users className="w-4 h-4" />,
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    href: "/leaderboard",
    icon: <Trophy className="w-4 h-4" />,
  },
  {
    id: "sponsors",
    label: "Sponsors",
    href: "/sponsors",
    icon: <Star className="w-4 h-4" />,
  },
  // {
  //   id: "about",
  //   label: "About",
  //   href: "/about",
  //   icon: <Info className="w-4 h-4" />,
  // },
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
  const { isAuthenticated, user, logout } = useAuth();
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  const visibleItems = React.useMemo(() => {
    if (isAuthenticated) return items;
    const allow = new Set(["home", "leaderboard", "about"]);
    return items.filter((it) => allow.has(it.id));
  }, [isAuthenticated, items]);

  const currentActiveId = React.useMemo(() => {
    if (activeId) return activeId;
    const match = visibleItems.find((it) => it.href === pathname);
    return match?.id;
  }, [activeId, visibleItems, pathname]);

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
      <nav className={`fixed top-0 left-0 right-0 z-50 ${className}`}>
        {/* Desktop Navigation */}
        <div className="hidden md:flex bg-bg-elevated shadow-md border-b border-border-subtle p-1.5 items-center justify-between gap-1 transition-all duration-300">
          {/* Left side: Logo and Nav Items */}
          <div className="flex items-center gap-1">
            {/* Logo */}
            <Link
              href="/"
              aria-label="Go to Home"
              className="flex items-center pl-2 pr-3 cursor-pointer"
            >
              <Image
                src="/logo.jpeg"
                alt="Wall-E Arena Logo"
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            </Link>
            {visibleItems.map((item) => {
              const isActive = item.id === currentActiveId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    flex items-center justify-center space-x-1.5 rounded-full font-medium whitespace-nowrap px-6 py-2.5 border
                    ${
                      isActive
                        ? "bg-gradient-brand text-text-main border-accent-pink-soft"
                        : "text-text-muted hover:text-text-main hover:bg-bg-card-soft border-transparent"
                    }
                    outline-none focus:outline-none focus-visible:outline-none focus:ring-0 active:bg-transparent
                  `}
                >
                  {item.icon && (
                    <span
                      className={
                        isActive ? "text-text-main" : "text-text-muted"
                      }
                    >
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
                  className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-2 py-1.5 text-sm font-medium shadow-sm hover:bg-bg-card-soft transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <Avatar
                    name={user?.username || "User"}
                    src={user?.avatar_url || undefined}
                    size="sm"
                    className="h-7 w-7"
                  />
                  <span className="text-text-main">Account</span>
                  <ChevronDown
                    className={`h-4 w-4 text-text-muted transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border-subtle bg-bg-card p-1.5 shadow-lg z-50"
                  >
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/dashboard");
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main hover:bg-bg-card-soft"
                    >
                      <LayoutDashboard className="h-4 w-4 text-accent-pink-500" />
                      <span>Dashboard</span>
                    </div>
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/admin");
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-main hover:bg-bg-card-soft"
                    >
                      <Settings className="h-4 w-4 text-accent-pink-500" />
                      <span>Admin</span>
                    </div>
                    <div className="my-1 h-px bg-border-subtle" />
                    <div
                      role="menuitem"
                      tabIndex={0}
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
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
                className="inline-flex items-center rounded-full bg-gradient-brand text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-pink-soft transition"
              >
                Join Us
              </Link>
            )}
          </div>
        </div>
        {/* Mobile Navigation Header */}
        <div className="md:hidden bg-bg-elevated shadow-md border border-border-subtle">
          <div className="flex items-center justify-between p-3">
            {/* Logo */}
            <Link
              href="/"
              aria-label="Go to Home"
              className="flex items-center gap-2 -ml-1 cursor-pointer"
            >
              <Image
                src="/logo.jpeg"
                alt="Wall-E Arena Logo"
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
              <span className="font-semibold text-text-main text-sm">
                Wall-E Arena
              </span>
            </Link>{" "}
            {/* Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-bg-card-soft transition-colors z-50 relative"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-text-muted" />
              ) : (
                <Menu className="w-6 h-6 text-text-muted" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Side Menu Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-bg-card shadow-2xl z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <Link
            href="/"
            aria-label="Go to Home"
            className="flex items-center gap-2 -ml-1 cursor-pointer"
          >
            <Image
              src="/logo.jpeg"
              alt="Wall-E Arena Logo"
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
            <span className="font-semibold text-text-main">Wall-E Arena</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-bg-card-soft transition-colors"
            aria-label="Close menu"
          >
            <X className="w-6 h-6 text-text-muted" />
          </button>
        </div>

        {/* Menu Content */}
        <div className="overflow-y-auto h-[calc(100%-73px)] p-4">
          <div className="space-y-1">
            {visibleItems.map((item) => {
              const isActive = item.id === currentActiveId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.href)}
                  className={`
                    w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium
                    ${
                      isActive
                        ? "bg-gradient-primary text-white shadow-md"
                        : "text-text-muted hover:bg-bg-card-soft hover:text-text-main"
                    }
                    outline-none focus:outline-none focus-visible:outline-none focus:ring-0 active:bg-transparent
                  `}
                >
                  {item.icon && (
                    <span
                      className={
                        isActive ? "text-text-main" : "text-text-muted"
                      }
                    >
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
            <div className="mt-4 pt-4 border-t border-border-subtle">
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
