"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Settings, LogOut } from "lucide-react";

/**
 * Mobile-only user menu designed to be embedded in the hamburger menu
 */
function MobileUserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="space-y-1">
      {/* Admin Link (only for admins) */}
      {user?.is_admin && (
        <button
          onClick={() => handleNavigation("/admin")}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all text-text-muted hover:bg-bg-card-soft hover:text-text-main"
        >
          <Settings className="h-4 w-4 text-primary-600" />
          <span className="text-sm">Admin</span>
        </button>
      )}

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all text-red-600 hover:bg-red-50"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm">Logout</span>
      </button>
    </div>
  );
}

export default MobileUserMenu;
export { MobileUserMenu };
