"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayersSection } from "./PlayersSection";
import { SponsorsSection } from "./SponsorsSection";
import { ContestsSection } from "./ContestsSection";
import { SlotsSection } from "./SlotsSection";
import { Users, Award, Trophy, Grid3x3, ArrowLeft, Home } from "lucide-react";

type Section = "players" | "sponsors" | "contests" | "slots";

export function AdminLayout() {
  const [activeSection, setActiveSection] = useState<Section>("players");
  const router = useRouter();

  const sections = [
    { id: "players" as Section, label: "Players", icon: Users },
    { id: "sponsors" as Section, label: "Sponsors", icon: Award },
    { id: "contests" as Section, label: "Contests", icon: Trophy },
    { id: "slots" as Section, label: "Slots", icon: Grid3x3 },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case "players":
        return <PlayersSection />;
      case "sponsors":
        return <SponsorsSection />;
      case "contests":
        return <ContestsSection />;
      case "slots":
        return <SlotsSection />;
      default:
        return <PlayersSection />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="mt-2 text-gray-600">
                Manage players, sponsors, contests, and slots
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
              <Home className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Home</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 overflow-x-auto scrollbar-hide">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`flex items-center gap-2 py-4 px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-all ${
                  activeSection === id
                    ? "border-orange-500 text-orange-600 bg-orange-50"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderSection()}
      </div>
    </div>
  );
}
