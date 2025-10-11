"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Settings, LogOut, ChevronDown } from "lucide-react";

function UserMenuComp() {
  const { logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Single unified button with avatar and dropdown */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium shadow-sm hover:bg-gray-50 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm shadow">
          U
        </div>
        <span className="hidden sm:inline text-gray-700">Account</span>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg z-50"
        >
          <div
            role="menuitem"
            tabIndex={0}
            onClick={() => {
              setOpen(false);
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
              setOpen(false);
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
              setOpen(false);
              await logout();
            }}
            className="cursor-pointer select-none flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenuComp;
export { UserMenuComp as UserMenu };
