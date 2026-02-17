"use client";

import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { LogOut, User, Mail, Calendar, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/common/consts";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import { useState } from "react";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-primary-50 to-gray-50">
      {/* Header */}
      <header className="bg-bg-elevated shadow-sm border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden">
                <Image
                  src="/logo.jpeg"
                  alt="Wall-E Arena Logo"
                  width={48}
                  height={48}
                  className="object-cover"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-main">
                  Wall-E Arena
                </h1>
                <p className="text-sm text-text-muted">Dashboard</p>
              </div>
            </div>
            <Button
              onClick={logout}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-bg-card rounded-3xl shadow-xl p-8 mb-8">
          <h2 className="text-3xl font-bold text-text-main mb-2">
            Welcome back, {user?.full_name || user?.username}! 👋
          </h2>
          <p className="text-text-muted">
            You&apos;re successfully logged in to your Wall-E Arena account.
          </p>
        </div>

        {/* User Info Card */}
        <div className="bg-bg-card rounded-3xl shadow-xl p-8 mb-8">
          <h3 className="text-xl font-bold text-text-main mb-6 flex items-center">
            <User className="w-5 h-5 mr-2 text-accent-pink-500" />
            Your Profile
          </h3>

          <div className="space-y-4">
            {/* Avatar section */}
            <div className="flex items-center gap-4 pb-4 border-b border-border-subtle">
              <div className="relative h-16 w-16 rounded-full overflow-hidden bg-bg-card-soft flex items-center justify-center text-lg font-semibold text-text-muted">
                {user?.avatar_url ? (
                  (() => {
                    const src = user.avatar_url.startsWith("/api")
                      ? `${API_BASE_URL}${user.avatar_url}`
                      : user.avatar_url;
                    return (
                      <img
                        src={src}
                        alt={user?.username || "avatar"}
                        className="h-16 w-16 object-cover object-center"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    );
                  })()
                ) : (
                  <span>{(user?.username?.[0] || "U").toUpperCase()}</span>
                )}
              </div>
              <div>
                <div className="text-base font-semibold text-text-main">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-sm text-text-muted">{user?.email}</div>
              </div>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <User className="w-5 h-5 text-text-muted mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-muted">Username</p>
                <p className="text-base text-text-main">{user?.username}</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Mail className="w-5 h-5 text-text-muted mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-muted">Email</p>
                <p className="text-base text-text-main">{user?.email}</p>
              </div>
            </div>

            {user?.full_name && (
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <User className="w-5 h-5 text-text-muted mt-1" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-text-muted">
                    Full Name
                  </p>
                  <p className="text-base text-text-main">{user.full_name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Calendar className="w-5 h-5 text-text-muted mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-text-muted">
                  Member Since
                </p>
                <p className="text-base text-text-main">
                  {formatDate(user?.created_at || "")}
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center space-x-4">
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full ${user?.is_active ? "bg-success" : "bg-danger"} mr-2`}
                ></div>
                <span className="text-sm text-text-muted">
                  {user?.is_active ? "Account Active" : "Account Inactive"}
                </span>
              </div>
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full ${user?.is_verified ? "bg-success" : "bg-warning"} mr-2`}
                ></div>
                <span className="text-sm text-text-muted">
                  {user?.is_verified ? "Email Verified" : "Email Not Verified"}
                </span>
              </div>
            </div>

            {/* Change Password Button */}
            <div className="pt-6 border-t border-border-subtle">
              <Button
                onClick={() => setIsChangePasswordOpen(true)}
                variant="outline"
                className="w-full flex items-center justify-center space-x-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Change Password</span>
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
