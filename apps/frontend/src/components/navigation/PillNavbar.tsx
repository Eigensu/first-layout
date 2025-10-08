"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Trophy, Users, Star } from "lucide-react";
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
}) => {
  const router = useRouter();
  const pathname = usePathname();

  const currentActiveId = React.useMemo(() => {
    if (activeId) return activeId;
    const match = items.find((it) => it.href === pathname);
    return match?.id;
  }, [activeId, items, pathname]);

  return (
    <nav className={`mx-auto max-w-3xl px-4 ${className}`}>
      <div className="bg-white rounded-full shadow-md border border-gray-200 p-1.5 flex items-center justify-center gap-1">
        {/* Logo */}
        <div className="flex items-center pl-2 pr-3">
          <Image
            src="/logo.jpeg"
            alt="WalleFantasy Logo"
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
              onClick={() => router.push(item.href)}
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
    </nav>
  );
};

export { PillNavbar };
export type { PillNavbarProps };
