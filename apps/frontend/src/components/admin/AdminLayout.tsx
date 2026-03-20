"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayersSection } from "./players/PlayersSection";
import { TeamsEditSection } from "./points/TeamsEditSection";
import { SponsorsSection } from "./sponsors/SponsorsSection";
import { ContestsSection } from "./contests/ContestsSection";
import { SlotsSection } from "./slots/SlotsSection";
import { CarouselSection } from "./carousel/CarouselSection";
import {
  Users,
  Award,
  Trophy,
  Grid3x3,
  Home,
  Image as ImageIcon,
} from "lucide-react";

type Section =
  | "players"
  | "sponsors"
  | "contests"
  | "slots"
  | "teamsEdit"
  | "carousel";

interface AdminLayoutProps {
  children?: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps = {}) {
  const [activeSection, setActiveSection] = useState<Section>("players");
  const router = useRouter();

  const sections = [
    { id: "players" as Section, label: "Players", icon: Users },
    { id: "sponsors" as Section, label: "Sponsors", icon: Award },
    { id: "contests" as Section, label: "Contests", icon: Trophy },
    { id: "slots" as Section, label: "Slots", icon: Grid3x3 },
    { id: "teamsEdit" as Section, label: "Edit by Teams", icon: Users },
    { id: "carousel" as Section, label: "Carousel Settings", icon: ImageIcon },
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
      case "teamsEdit":
        return <TeamsEditSection />;
      case "carousel":
        return <CarouselSection />;
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
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="mt-2 text-gray-600 hidden sm:block">
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
      {/* Navigation (mobile select + desktop tabs) */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          {/* Mobile: compact section selector */}
          <div className="block sm:hidden">
            <label htmlFor="admin-section" className="sr-only">
              Select section
            </label>
            <select
              id="admin-section"
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value as Section)}
              className="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-card text-text-main focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {sections.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop: segmented control tabs */}
          <div className="hidden sm:block">
            <div className="relative overflow-x-auto">
              <div
                role="tablist"
                aria-label="Admin sections"
                className="flex items-center gap-2 rounded-xl bg-gray-50/80 p-1 border border-gray-200 shadow-inner backdrop-blur supports-[backdrop-filter]:bg-gray-50/60"
              >
                {sections.map(({ id, label, icon: Icon }) => {
                  const isActive = activeSection === id;
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`panel-${id}`}
                      onClick={() => setActiveSection(id)}
                      className={`group flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                        isActive
                          ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow"
                          : "text-gray-700 hover:text-gray-900 hover:bg-white"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? "text-white"
                            : "text-gray-500 group-hover:text-gray-700"
                        }`}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children || renderSection()}
      </div>
    </div>
  );
}
