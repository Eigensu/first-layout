"use client";

import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { ROOT_DOMAIN, isRootDomainHost } from "@/common/consts/tournament";

export default function AdminPage() {
  // On wallearena.com the backend counts only platform admins as admins: the
  // apex names no tournament, so no one's tournament role applies there.
  // Anyone else signed in gets told where their admin lives instead of being
  // bounced home. Read on render: the server pass and the client's first pass
  // both show ProtectedRoute's spinner, so the choice never reaches markup
  // before the client makes it.
  const onRoot =
    typeof window !== "undefined" && isRootDomainHost(window.location.host);

  if (onRoot) {
    return (
      <ProtectedRoute>
        <RootAdmin />
      </ProtectedRoute>
    );
  }
  return (
    <ProtectedRoute requireAdmin={true}>
      <AdminLayout />
    </ProtectedRoute>
  );
}

function RootAdmin() {
  const { user } = useAuth();
  if (user?.is_platform_admin) return <AdminLayout />;
  return <TournamentAdminElsewhere />;
}

function TournamentAdminElsewhere() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Manage your tournament on its own site
        </h1>
        <p className="mt-3 text-gray-600">
          Each tournament has its own admin page. If you run one, open it at
        </p>
        <p className="mt-2 font-mono text-sm text-gray-900 break-all">
          yourtournament.{ROOT_DOMAIN}/admin
        </p>
        <p className="mt-3 text-gray-600">
          and sign in there. Not sure of the address? Ask whoever set up your
          tournament.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
