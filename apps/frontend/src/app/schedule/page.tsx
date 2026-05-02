"use client";

import React, { useState, useMemo } from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { HeroHeader } from "@/components/teamviewer/molecules/HeroHeader";
import { Footer } from "@/components/navigation/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import scheduleData from "@/config/schedule.json";
import { Card } from "@/components/ui/Card";
import { Clock, MapPin, Trophy } from "lucide-react";

interface ScheduleItem {
  type: "match" | "break";
  time: string;
  team1?: string;
  team2?: string;
  category?: string;
  points?: string;
  court?: string;
  details?: string;
}

export default function SchedulePage() {
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const cats = new Set<string>();
    scheduleData.forEach((item: any) => {
      if (item.type === "match" && item.category && item.category !== "nan") {
        cats.add(item.category);
      }
    });
    return ["All", ...Array.from(cats)].sort();
  }, []);

  const filteredSchedule = useMemo(() => {
    let currentDetails = "";
    const result: ScheduleItem[] = [];

    scheduleData.forEach((item: any) => {
      // Propagate details (like SESSION 1, QUARTERS, etc) if it's the first in a block
      if (item.type === "match") {
        if (item.details && item.details !== "nan") {
          currentDetails = item.details;
        } else if (item.details === "nan" || !item.details) {
           // We could attach currentDetails, but maybe better to keep it attached to the first item
           // or just show it as a group header. Let's group by time instead.
        }
      }
      
      if (item.type === "break") {
        result.push(item);
        return;
      }

      if (selectedCategory === "All" || item.category === selectedCategory) {
        result.push(item);
      }
    });
    return result;
  }, [selectedCategory]);

  // Group by time
  const groupedSchedule = useMemo(() => {
    const groups: { [key: string]: ScheduleItem[] } = {};
    filteredSchedule.forEach((item) => {
      const timeKey = item.time || "TBD";
      if (!groups[timeKey]) groups[timeKey] = [];
      groups[timeKey].push(item);
    });
    return groups;
  }, [filteredSchedule]);

  return (
    <div className="min-h-screen bg-bg-body text-text-main flex flex-col">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 sm:h-24"></div>

      <HeroHeader
        title="Tournament Schedule"
        subtitle="Match timings, courts, and categories for JPL 2026"
      />

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-1 max-w-5xl">
        {/* Filters */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          {/* Mobile Dropdown */}
          <div className="w-full sm:hidden relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full appearance-none bg-bg-card border border-border-subtle text-text-main py-3 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-pink-500 focus:border-transparent font-medium"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "All" ? "All Categories" : cat}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>

          {/* Desktop Pills */}
          <div className="hidden sm:flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-gradient-brand text-white shadow-md"
                    : "bg-bg-card border border-border-subtle text-text-muted hover:text-text-main hover:bg-bg-card-soft"
                }`}
              >
                {cat === "All" ? "All Categories" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Schedule List */}
        <div className="space-y-8">
          {Object.entries(groupedSchedule).map(([time, items]) => {
            const isBreak = items.length === 1 && items[0].type === "break";

            if (isBreak) {
              return (
                <div key={time} className="relative flex items-center py-4">
                  <div className="flex-grow border-t border-border-subtle"></div>
                  <span className="flex-shrink-0 mx-4 px-4 py-1 rounded-full bg-bg-card-soft text-text-muted text-sm font-medium border border-border-subtle tracking-wider uppercase">
                    {items[0].time}
                  </span>
                  <div className="flex-grow border-t border-border-subtle"></div>
                </div>
              );
            }

            // Find if there's any details tag (like SESSION 1) in this time block
            const sessionTag = items.find(i => i.details && i.details !== "nan")?.details;

            return (
              <div key={time} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-accent-pink-500 font-semibold text-lg bg-accent-pink-500/10 px-3 py-1.5 rounded-lg border border-accent-pink-500/20">
                    <Clock className="w-5 h-5" />
                    {time}
                  </div>
                  {sessionTag && (
                    <div className="text-sm font-bold tracking-wider text-text-muted uppercase bg-bg-card-soft px-3 py-1.5 rounded-lg">
                      {sessionTag}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-2 sm:pl-4">
                  {items.map((item, idx) => (
                    <Card key={idx} className="p-4 hover:border-accent-pink-soft transition-colors flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="bg-bg-card-soft text-text-main text-xs font-bold px-2.5 py-1 rounded-md border border-border-subtle">
                            {item.category}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-text-muted font-medium">
                            <Trophy className="w-3.5 h-3.5" />
                            {item.points} Pts
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-medium text-accent-blue-400 bg-accent-blue-400/10 px-2.5 py-1 rounded-md border border-accent-blue-400/20">
                          <MapPin className="w-3.5 h-3.5" />
                          Court {item.court}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <div className="flex-1 text-right font-semibold text-text-main pr-3">
                          {item.team1}
                        </div>
                        <div className="flex-shrink-0 text-text-subtle font-mono text-xs italic bg-bg-card-soft px-2 py-0.5 rounded-full">
                          VS
                        </div>
                        <div className="flex-1 text-left font-semibold text-text-main pl-3">
                          {item.team2}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {Object.keys(groupedSchedule).length === 0 && (
            <div className="text-center py-12 text-text-muted bg-bg-card rounded-xl border border-border-subtle">
              No matches found for the selected category.
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
