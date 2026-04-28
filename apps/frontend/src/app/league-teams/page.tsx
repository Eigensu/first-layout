"use client";

import React, { useState } from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { HeroHeader } from "@/components/teamviewer/molecules/HeroHeader";
import { Footer } from "@/components/navigation/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Card } from "@/components/ui/Card";
import { Users, Shield, Search } from "lucide-react";

const TEAMS = [
  "Dink Dawgs",
  "Dink Responsibly",
  "Giants",
  "Grand Slammers",
  "Legends",
  "Maru Royals",
  "Modani Mavericks",
  "Paddle Battle",
  "Paramount Rangers",
  "Pickle Ballers",
  "Pickle Pals",
  "Sanghavi Smashers",
  "Smash Bros",
  "Su's Crew"
].sort();

export default function LeagueTeamsPage() {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTeams = TEAMS.filter((team) =>
    team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bg-body text-text-main flex flex-col">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 sm:h-24"></div>

      <HeroHeader
        title="League Teams"
        subtitle="Meet the 14 franchises competing in JPL 2026"
      />

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-1 max-w-6xl">
        <div className="mb-8 flex justify-between items-center flex-col sm:flex-row gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-bg-card border border-border-subtle focus:border-accent-pink-500 focus:ring-1 focus:ring-accent-pink-500 text-text-main transition-colors outline-none"
            />
          </div>
          <div className="text-text-muted font-medium bg-bg-card px-4 py-2 rounded-lg border border-border-subtle">
            {filteredTeams.length} Teams
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredTeams.map((team, idx) => (
            <Card
              key={idx}
              className="group p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-pink-500/10 hover:border-accent-pink-500/50 transition-all duration-300 flex flex-col items-center text-center cursor-pointer overflow-hidden relative"
            >
              {/* Subtle background glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent-pink-500/0 via-transparent to-accent-blue-500/0 group-hover:from-accent-pink-500/5 group-hover:to-accent-blue-500/5 transition-colors duration-500" />
              
              <div className="w-20 h-20 mb-4 rounded-full bg-gradient-brand flex items-center justify-center text-white shadow-lg shadow-accent-pink-500/20 relative z-10">
                <Shield className="w-10 h-10" />
              </div>
              
              <h3 className="text-lg font-bold text-text-main mb-2 relative z-10">{team}</h3>
              
              <div className="mt-auto pt-4 border-t border-border-subtle w-full flex items-center justify-center gap-2 text-sm text-text-muted relative z-10">
                <Users className="w-4 h-4" />
                View Roster (Coming Soon)
              </div>
            </Card>
          ))}
        </div>

        {filteredTeams.length === 0 && (
          <div className="text-center py-16 bg-bg-card rounded-2xl border border-border-subtle border-dashed">
            <Shield className="w-16 h-16 text-text-muted/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-text-main mb-2">No teams found</h3>
            <p className="text-text-muted">Try adjusting your search criteria.</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
