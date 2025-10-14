"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Search, Filter, Upload, Plus, Edit, Trash2 } from "lucide-react";

export function SponsorsSection() {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock data
  const sponsors = [
    {
      id: 1,
      name: "Nike",
      logo: "NK",
      tier: "Platinum",
      contract: "₹50,000/year",
      status: "Active",
    },
    {
      id: 2,
      name: "Adidas",
      logo: "AD",
      tier: "Gold",
      contract: "₹35,000/year",
      status: "Active",
    },
    {
      id: 3,
      name: "Puma",
      logo: "PM",
      tier: "Silver",
      contract: "₹20,000/year",
      status: "Pending",
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
                  placeholder="Search sponsors..."
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
              <Button variant="ghost" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Sponsor
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Sponsors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sponsors.map((sponsor) => (
          <Card key={sponsor.id} hover>
            <CardBody className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {sponsor.logo}
                </div>
                <div className="flex gap-2">
                  <button className="text-blue-600 hover:text-blue-900 p-2 hover:bg-blue-50 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {sponsor.name}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Tier:</span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      sponsor.tier === "Platinum"
                        ? "bg-purple-100 text-purple-800"
                        : sponsor.tier === "Gold"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {sponsor.tier}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Contract:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {sponsor.contract}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status:</span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      sponsor.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {sponsor.status}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
