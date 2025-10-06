"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Trophy, Users, Star } from "lucide-react";

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
  { id: "leaderboards", label: "Leaderboards", href: "/leaderboards", icon: <Trophy className="w-4 h-4" /> },
  { id: "my-team", label: "My Team", href: "/demo", icon: <Users className="w-4 h-4" /> },
  { id: "sponsors", label: "Sponsors", href: "/sponsors", icon: <Star className="w-4 h-4" /> },
];

const PillNavbar: React.FC<PillNavbarProps> = ({ items = DEFAULT_ITEMS, activeId, className = "" }) => {
  const router = useRouter();
  const pathname = usePathname();

  const currentActiveId = React.useMemo(() => {
    if (activeId) return activeId;
    const match = items.find((it) => it.href === pathname);
    return match?.id;
  }, [activeId, items, pathname]);

  return (
    <nav className={`mx-auto max-w-3xl px-4 ${className}`}>
      <div className="bg-white rounded-full shadow-md border border-gray-200 p-2 flex items-center justify-center">
        {items.map((item) => {
          const isActive = item.id === currentActiveId;
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.href)}
              className={`
                flex items-center space-x-1 px-9 py-1 rounded-full font-medium transition-all
                ${
                  isActive
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow"
                    : "text-gray-600 hover:text-gray-900"
                }
              `}
            >
              {item.icon && (
                <span className={isActive ? "text-white" : "text-gray-500"}>{item.icon}</span>
              )}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export { PillNavbar };
export type { PillNavbarProps };
