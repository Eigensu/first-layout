"use client";

import React from "react";
import Image from "next/image";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { HeroHeader } from "@/components/teamviewer/molecules/HeroHeader";
import { Footer } from "@/components/navigation/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Card } from "@/components/ui/Card";
import { Map, Download } from "lucide-react";

export default function CourtMapPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-bg-body text-text-main flex flex-col">
      <PillNavbar
        mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
      />
      <div className="h-20 sm:h-24"></div>

      <HeroHeader
        title="Court Map"
        subtitle="Sportime Pickleball - Wayne, New Jersey"
      />

      <main className="container mx-auto px-4 sm:px-6 py-8 flex-1 max-w-5xl">
        <Card className="p-4 sm:p-8 bg-bg-card-soft border-border-subtle flex flex-col items-center">
          <div className="w-full flex justify-end mb-4">
            <a
              href="/wayne-court-map.jpg"
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-bg-elevated border border-border-subtle rounded-xl text-sm font-medium hover:bg-bg-card hover:text-text-main text-text-muted transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Map
            </a>
          </div>
          
          <div className="relative w-full max-w-4xl aspect-[3/4] sm:aspect-[4/5] rounded-xl overflow-hidden shadow-2xl border border-border-subtle bg-white">
            <Image
              src="/wayne-court-map.jpg"
              alt="Wayne Court Map"
              fill
              className="object-contain"
              priority
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
            />
            
            {/* Fallback overlay in case image is missing while development */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-elevated/80 backdrop-blur-sm -z-10 text-center p-6">
              <Map className="w-16 h-16 text-text-muted mb-4" />
              <p className="text-text-muted text-lg font-medium">Map image not found.</p>
              <p className="text-text-subtle text-sm mt-2 max-w-md">
                Please place the <code className="bg-bg-card px-2 py-1 rounded">wayne-court-map.jpg</code> file in the <code className="bg-bg-card px-2 py-1 rounded">public/</code> directory.
              </p>
            </div>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
