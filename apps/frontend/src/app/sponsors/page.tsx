"use client";

import { PillNavbar } from "@/components/navigation/PillNavbar";
import { Footer } from "@/components";
import { SponsorsView } from "@/components/sponsors";
import { useSponsorsPage } from "@/components/sponsors";

export default function SponsorsPage() {
  const { sponsors, loading, error, featuredSponsors } = useSponsorsPage();

  return (
    <div className="min-h-screen bg-bg-body">
      {/* Navigation */}
      <PillNavbar />

      {/* Spacer to prevent content from hiding under fixed navbar */}
      <div className="h-20"></div>

      <SponsorsView
        sponsors={sponsors}
        loading={loading}
        error={error}
        featuredSponsors={featuredSponsors}
      />
      <Footer />
    </div>
  );
}
