"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Search,
  Filter,
  Plus,
  Trophy,
  Calendar,
  Users,
  IndianRupee,
} from "lucide-react";

export function ContestsSection() {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data
  const contests = [
    {
      id: 1,
      name: "Spring Championship 2024",
      status: "Active",
      startDate: "2024-03-01",
      endDate: "2024-05-31",
      participants: 128,
      prizePool: "₹10,000",
    },
    {
      id: 2,
      name: "Summer League",
      status: "Upcoming",
      startDate: "2024-06-01",
      endDate: "2024-08-31",
      participants: 0,
      prizePool: "₹15,000",
    },
    {
      id: 3,
      name: "Winter Invitational",
      status: "Completed",
      startDate: "2023-12-01",
      endDate: "2024-02-28",
      participants: 96,
      prizePool: "₹8,000",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search contests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="ghost" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Contest
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Contests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contests.map((contest) => (
          <Card key={contest.id} hover>
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                  <Trophy className="w-6 h-6" />
                </div>
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full ${
                    contest.status === "Active"
                      ? "bg-green-100 text-green-800"
                      : contest.status === "Upcoming"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {contest.status}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {contest.name}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {new Date(contest.startDate).toLocaleDateString()} -{" "}
                    {new Date(contest.endDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Users className="w-4 h-4" />
                  <span>{contest.participants} Participants</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <IndianRupee className="w-4 h-4" />
                  <span>{contest.prizePool} Prize Pool</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  View Details
                </Button>
                <Button variant="ghost" size="sm" className="flex-1">
                  Edit
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
