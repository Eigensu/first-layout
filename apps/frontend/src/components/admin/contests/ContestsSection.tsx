"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Search, Trophy, Calendar } from "lucide-react";
import { adminContestsApi, Contest } from "@/lib/api/admin/contests";
import { formatISTRange } from "@/lib/utils";

export function ContestsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminContestsApi.list({
        page_size: 6,
        search: searchQuery || undefined,
      });
      setContests(res.contests);
    } catch (e: any) {
      setError(e?.message || "Failed to load contests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search contests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load();
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-border-subtle bg-bg-card text-text-main rounded-lg focus:ring-2 focus:ring-accent-orange-500 focus:border-transparent placeholder:text-text-muted"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Link
                href="/admin/contests"
                className="px-3 py-2 rounded bg-orange-500 text-white text-sm hover:bg-orange-600"
              >
                Open Contests Manager
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-gray-600 text-sm">Loading...</div>}

      {/* Contests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contests.map((contest) => (
          <Card key={contest.id} hover>
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <Trophy className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 text-xs font-medium rounded-full bg-bg-chip text-text-main">
                  {contest.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-text-main mb-4">
                {contest.name}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-text-muted">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {formatISTRange(contest.start_at, contest.end_at)}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <Link
                  href={`/admin/contests/${contest.id}`}
                  className="px-3 py-1 rounded border border-border text-sm flex-1 text-center text-text-main hover:bg-bg-elevated transition-colors"
                >
                  Manage
                </Link>
                <Link
                  href={`/contests/${contest.id}`}
                  className="px-3 py-1 rounded border border-border text-sm flex-1 text-center text-text-main hover:bg-bg-elevated transition-colors"
                >
                  View Public
                </Link>
              </div>
            </CardBody>
          </Card>
        ))}
        {!loading && contests.length === 0 && (
          <div className="text-text-muted">No contests yet.</div>
        )}
      </div>
    </div>
  );
}
