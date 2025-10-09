"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Trophy, Users, Star, Menu, X } from "lucide-react";
import Image from "next/image";

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

  const handleNavigation = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className={`mx-auto max-w-3xl px-2 sm:px-4 ${className}`}>
        {/* Desktop Navigation */}
        <div className="hidden md:flex bg-white rounded-full shadow-md border border-gray-200 p-1.5 items-center justify-center gap-1">
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
                  flex items-center justify-center space-x-1.5 px-6 py-2.5 rounded-full font-medium transition-all whitespace-nowrap
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

        {/* Mobile Navigation Header */}
        <div className="md:hidden bg-white rounded-2xl shadow-md border border-gray-200">
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
