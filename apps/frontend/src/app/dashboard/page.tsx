"use client";

import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { LogOut, User, Mail, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

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
      <header className="bg-white shadow-sm border-b border-gray-200">
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
                <h1 className="text-2xl font-bold text-gray-900">
                  Wall-E Arena
                </h1>
                <p className="text-sm text-gray-500">Dashboard</p>
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
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.full_name || user?.username}! 👋
          </h2>
          <p className="text-gray-600">
            You&apos;re successfully logged in to your Wall-E Arena account.
          </p>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <User className="w-5 h-5 mr-2 text-primary-600" />
            Your Profile
          </h3>

          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <User className="w-5 h-5 text-gray-400 mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Username</p>
                <p className="text-base text-gray-900">{user?.username}</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Mail className="w-5 h-5 text-gray-400 mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="text-base text-gray-900">{user?.email}</p>
              </div>
            </div>

            {user?.full_name && (
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <User className="w-5 h-5 text-gray-400 mt-1" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Full Name</p>
                  <p className="text-base text-gray-900">{user.full_name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Calendar className="w-5 h-5 text-gray-400 mt-1" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Member Since
                </p>
                <p className="text-base text-gray-900">
                  {formatDate(user?.created_at || "")}
                </p>
              </div>
            </div>

            <div className="pt-4 flex items-center space-x-4">
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full ${user?.is_active ? "bg-green-500" : "bg-red-500"} mr-2`}
                ></div>
                <span className="text-sm text-gray-600">
                  {user?.is_active ? "Account Active" : "Account Inactive"}
                </span>
              </div>
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full ${user?.is_verified ? "bg-green-500" : "bg-yellow-500"} mr-2`}
                ></div>
                <span className="text-sm text-gray-600">
                  {user?.is_verified ? "Email Verified" : "Email Not Verified"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Coming Soon */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Coming Soon</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🏏</div>
              <h4 className="font-semibold text-gray-900 mb-2">Create Teams</h4>
              <p className="text-sm text-gray-600">
                Build your dream cricket team
              </p>
              <div className="mt-4">
                <Button onClick={() => router.push("/")}>Create Teams</Button>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🏆</div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Join Contests
              </h4>
              <p className="text-sm text-gray-600">
                Compete with other players
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">📊</div>
              <h4 className="font-semibold text-gray-900 mb-2">View Stats</h4>
              <p className="text-sm text-gray-600">Track your performance</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
