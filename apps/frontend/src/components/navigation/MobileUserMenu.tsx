"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Settings, LogOut } from "lucide-react";

interface MobileUserMenuProps {
  onClose?: () => void;
}

/**
 * Mobile-only user menu designed to be embedded in the hamburger menu
 */
function MobileUserMenu({ onClose }: MobileUserMenuProps = {}) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleNavigation = (path: string) => {
    router.push(path);
    if (onClose) onClose();
  };

  const handleLogout = async () => {
    await logout();
    if (onClose) onClose();
  };

  return (
    <div className="space-y-2">
      {/* User Profile Row */}
      {user && (
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] border border-white/[0.07] px-3 py-2.5 mb-3">
          {/* Avatar */}
          <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-[15px] shadow-inner overflow-hidden">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={user.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{user.username?.charAt(0).toUpperCase() || "U"}</span>
            )}
          </div>
          {/* Name & status */}
          <div className="min-w-0">
            <p className="text-white text-[14px] font-semibold leading-tight truncate">
              {user.username}
            </p>
            <p className="text-white/40 text-[11px] leading-tight mt-0.5">Logged in</p>
          </div>
        </div>
      )}

      {/* Admin Link */}
      {user?.is_admin && (
        <button
          onClick={() => handleNavigation("/admin")}
          className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/55 hover:text-white/90 hover:bg-white/5 transition-all duration-200 active:scale-[0.97]"
        >
          <Settings className="w-4 h-4 shrink-0 text-white/40 group-hover:text-white/70 transition-colors" />
          <span className="text-[14px] font-medium">Admin Panel</span>
        </button>
      )}

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 active:scale-[0.97]"
      >
        <LogOut className="w-4 h-4 shrink-0 transition-colors group-hover:text-red-400" />
        <span className="text-[14px] font-medium">Logout</span>
      </button>
    </div>
  );
}

export default MobileUserMenu;
export { MobileUserMenu };
