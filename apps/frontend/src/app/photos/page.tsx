"use client";

import React from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { HeroHeader } from "@/components/teamviewer/molecules/HeroHeader";
import { Footer } from "@/components/navigation/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Card } from "@/components/ui/Card";
import { Camera, ExternalLink, Smartphone, Globe, Copy } from "lucide-react";
import Link from "next/link";
import { showToast } from "@/components/ui/Toast";

export default function PhotosPage() {
  const { isAuthenticated } = useAuth();

  const copyUcode = () => {
    navigator.clipboard.writeText("QZWPK*");
    showToast({
      title: "Ucode Copied",
      message: "The code QZWPK* has been copied to your clipboard.",
      variant: "success",
    });
  };

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
          
          {/* JPL 2026_NJ Photos (KwikPic) */}
          <Card className="group relative overflow-hidden border-accent-pink-500/30 hover:border-accent-pink-500 hover:shadow-xl hover:shadow-accent-pink-500/10 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-pink-500/5 to-transparent" />
            <div className="p-8 flex flex-col h-full items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-pink-400 to-rose-600 flex items-center justify-center mb-6 shadow-lg shadow-accent-pink-500/30">
                <Camera className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-text-main mb-2">JPL 2026_NJ</h3>
              <p className="text-text-muted mb-6 flex-1">
                Get your photos instantly using Face Recognition! View the official JPL 2026 gallery on KwikPic.
              </p>
              
              <div className="w-full space-y-3">
                <Link
                  href="https://kwikpic-in.app.link/e/kTtaHjJzT2b?uCode=QZWPK*"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-brand text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-accent-pink-500/20 active:scale-[0.98]"
                >
                  <Globe className="w-4 h-4" />
                  View Website Gallery
                  <ExternalLink className="w-3 h-3 ml-1 opacity-70" />
                </Link>

                <Link
                  href="https://kwikpic-in.app.link/jpuKFjJzT2b?groupCode=UJ9GGF&adminToken=UJ9GGFjtRyXzQ1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-bg-elevated text-text-main border border-border-subtle rounded-xl font-medium hover:bg-bg-card transition-colors active:scale-[0.98]"
                >
                  <Smartphone className="w-4 h-4" />
                  Join via Mobile App
                </Link>

                <div className="pt-4 border-t border-border-subtle/50">
                  <div className="text-xs text-text-muted uppercase tracking-wider mb-2 font-semibold">Join via Ucode</div>
                  <button 
                    onClick={copyUcode}
                    className="w-full flex items-center justify-between py-2 px-4 bg-bg-body border border-dashed border-accent-pink-500/30 rounded-lg text-accent-pink-500 font-mono font-bold hover:bg-accent-pink-500/5 transition-colors group/code"
                  >
                    <span>QZWPK*</span>
                    <div className="flex items-center gap-1 text-[10px] font-sans uppercase">
                      <Copy className="w-3 h-3" />
                      Copy
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* 2025 Photos (Available) */}
          <Card className="group relative overflow-hidden border-accent-blue-500/30 hover:border-accent-blue-500 hover:shadow-xl hover:shadow-accent-blue-500/10 transition-all duration-300 opacity-80 hover:opacity-100 transition-opacity">
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
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-accent-blue-500/50 text-text-main rounded-xl font-semibold hover:bg-accent-blue-500/10 transition-all active:scale-[0.98]"
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
