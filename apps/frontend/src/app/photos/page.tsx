"use client";

import React from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { HeroHeader } from "@/components/teamviewer/molecules/HeroHeader";
import { Footer } from "@/components/navigation/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Card } from "@/components/ui/Card";
import { Camera, ExternalLink, CalendarDays } from "lucide-react";
import Link from "next/link";

export default function PhotosPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-bg-body text-text-main flex flex-col">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 sm:h-24"></div>

      <HeroHeader
        title="Photo Galleries"
        subtitle="Relive the best moments from JPL"
      />

      <main className="container mx-auto px-4 sm:px-6 py-12 flex-1 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 2026 Photos (Coming Soon) */}
          <Card className="group relative overflow-hidden border-border-subtle hover:border-accent-pink-500/50 transition-colors bg-bg-card-soft">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-pink-500/5 to-accent-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="p-8 flex flex-col h-full items-center text-center">
              <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mb-6 border border-border-subtle shadow-inner">
                <Camera className="w-8 h-8 text-text-muted" />
              </div>
              <h3 className="text-2xl font-bold text-text-main mb-2">JPL 2026</h3>
              <p className="text-text-muted mb-8 flex-1">
                The gallery for this year's tournament will be available soon. Check back after the event!
              </p>
              
              <div className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-bg-elevated rounded-xl border border-border-subtle text-text-muted font-medium cursor-not-allowed">
                <CalendarDays className="w-5 h-5" />
                Available on May 3rd
              </div>
            </div>
          </Card>

          {/* 2025 Photos (Available) */}
          <Card className="group relative overflow-hidden border-accent-blue-500/30 hover:border-accent-blue-500 hover:shadow-xl hover:shadow-accent-blue-500/10 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-blue-500/5 to-transparent" />
            <div className="p-8 flex flex-col h-full items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-blue-400 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-accent-blue-500/30">
                <Camera className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-text-main mb-2">JPL 2025</h3>
              <p className="text-text-muted mb-8 flex-1">
                Explore the unforgettable moments, fierce rallies, and celebrations from last year's tournament on SmugMug.
              </p>
              
              <Link
                href="https://mitsriaphotography.smugmug.com/JPL-2025/n-hMrNNL"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-brand text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-accent-pink-500/20 active:scale-[0.98]"
              >
                View 2025 Gallery
                <ExternalLink className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </Card>

        </div>
      </main>

      <Footer />
    </div>
  );
}
