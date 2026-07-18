import Link from "next/link";
import { ROOT_DOMAIN } from "@/common/consts/tournament";

export default function TournamentNotFound() {
  return (
    <div className="min-h-screen bg-bg-body text-text-main flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl mb-6">🏏</p>
        <h1 className="text-3xl font-bold mb-3">Tournament not found</h1>
        <p className="text-text-muted mb-8">
          There is no tournament at this address. It may have been archived, or
          the link may be misspelled.
        </p>
        <Link
          href={`https://${ROOT_DOMAIN}`}
          className="inline-block px-6 py-3 rounded-xl bg-white text-purple-900 font-semibold shadow hover:shadow-lg transition-all"
        >
          Go to {ROOT_DOMAIN}
        </Link>
      </div>
    </div>
  );
}
