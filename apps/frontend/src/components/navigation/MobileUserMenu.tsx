"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Settings, LogOut, User } from "lucide-react";

/**
 * Mobile-only user menu designed to be embedded in the hamburger menu
 */
function MobileUserMenu() {
  const { logout } = useAuth();
  const router = useRouter();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="space-y-1">
      {/* User Profile Link */}
      <button
        onClick={() => handleNavigation("/user")}
        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <User className="h-4 w-4 text-primary-600" />
        <span className="text-sm">Profile</span>
      </button>

      {/* Dashboard Link */}
      <button
        onClick={() => handleNavigation("/dashboard")}
        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <LayoutDashboard className="h-4 w-4 text-primary-600" />
        <span className="text-sm">Dashboard</span>
      </button>

      {/* Admin Link */}
      <button
        onClick={() => handleNavigation("/admin")}
        className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <Settings className="h-4 w-4 text-primary-600" />
        <span className="text-sm">Admin</span>
      </button>

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
