"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { UserMenu } from "@/components/navigation/UserMenu";
import { SponsorCard } from "@/components/sponsors/organs/SponsorCard";
import { Sparkles, Award, Star } from "lucide-react";

// Mock data structure - this will be replaced with API data later
const mockSponsors = [
  {
    id: "1",
    name: "TechCorp Solutions",
    logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=400&h=400&fit=crop",
    tier: "platinum" as const,
    description: "Leading technology partner powering our fantasy platform",
    website: "https://techcorp.example.com",
    featured: true,
  },
  {
    id: "2",
    name: "SportGear Pro",
    logo: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400&h=400&fit=crop",
    tier: "gold" as const,
    description: "Premium sports equipment and merchandise provider",
    website: "https://sportgear.example.com",
    featured: true,
  },
  {
    id: "3",
    name: "Cricket Analytics Inc",
    logo: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=400&h=400&fit=crop",
    tier: "gold" as const,
    description: "Advanced cricket statistics and data analytics",
    website: "https://cricketanalytics.example.com",
    featured: false,
  },
  {
    id: "4",
    name: "GameBoost Energy",
    logo: "https://images.unsplash.com/photo-1625772452859-1c03d5bf1137?w=400&h=400&fit=crop",
    tier: "silver" as const,
    description: "Official energy drink partner for peak performance",
    website: "https://gameboost.example.com",
    featured: false,
  },
  {
    id: "5",
    name: "FastPay Digital",
    logo: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=400&fit=crop",
    tier: "silver" as const,
    description: "Secure and instant payment solutions",
    website: "https://fastpay.example.com",
    featured: false,
  },
  {
    id: "6",
    name: "CloudHost Pro",
    logo: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=400&fit=crop",
    tier: "bronze" as const,
    description: "Reliable cloud infrastructure partner",
    website: "https://cloudhost.example.com",
    featured: false,
  },
  {
    id: "7",
    name: "MediaStream TV",
    logo: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400&h=400&fit=crop",
    tier: "bronze" as const,
    description: "Live streaming and broadcasting partner",
    website: "https://mediastream.example.com",
    featured: false,
  },
  {
    id: "8",
    name: "FitLife Nutrition",
    logo: "https://images.unsplash.com/photo-1505682634904-d7c8d95cdc50?w=400&h=400&fit=crop",
    tier: "bronze" as const,
    description: "Sports nutrition and wellness products",
    website: "https://fitlife.example.com",
    featured: false,
  },
];

export default function SponsorsPage() {
  const [selectedTier, setSelectedTier] = useState<string>("all");

  const filteredSponsors =
    selectedTier === "all"
      ? mockSponsors
      : mockSponsors.filter((sponsor) => sponsor.tier === selectedTier);

  const featuredSponsors = mockSponsors.filter((sponsor) => sponsor.featured);
  const tierCounts = {
    platinum: mockSponsors.filter((s) => s.tier === "platinum").length,
    gold: mockSponsors.filter((s) => s.tier === "gold").length,
    silver: mockSponsors.filter((s) => s.tier === "silver").length,
    bronze: mockSponsors.filter((s) => s.tier === "bronze").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50 to-gray-50">
      {/* Navigation */}
      <PillNavbar />

      {/* Spacer to prevent content from hiding under fixed navbar */}
      <div className="h-20"></div>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-purple-500/10" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-600 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              Our Partners
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-orange-600 via-purple-600 to-orange-600 bg-clip-text text-transparent">
              Meet Our Sponsors
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              We&apos;re proud to partner with leading brands that share our
              vision of creating the ultimate fantasy cricket experience.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Featured Sponsors */}
      {featuredSponsors.length > 0 && (
        <section className="py-12">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                <h2 className="text-3xl font-bold text-gray-900">
                  Featured Partners
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {featuredSponsors.map((sponsor, index) => (
                  <motion.div
                    key={sponsor.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 * index }}
                  >
                    <SponsorCard sponsor={sponsor} featured />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Filter Tabs */}
      <section className="py-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              {
                value: "all",
                label: "All Sponsors",
                count: mockSponsors.length,
              },
              {
                value: "platinum",
                label: "Platinum",
                count: tierCounts.platinum,
              },
              { value: "gold", label: "Gold", count: tierCounts.gold },
              { value: "silver", label: "Silver", count: tierCounts.silver },
              { value: "bronze", label: "Bronze", count: tierCounts.bronze },
            ].map((tier) => (
              <button
                key={tier.value}
                onClick={() => setSelectedTier(tier.value)}
                className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                  selectedTier === tier.value
                    ? "bg-gradient-to-r from-orange-500 to-purple-500 text-white shadow-lg scale-105"
                    : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                }`}
              >
                {tier.label}
                <span
                  className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    selectedTier === tier.value ? "bg-white/20" : "bg-gray-100"
                  }`}
                >
                  {tier.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* All Sponsors Grid */}
      <section className="py-12 pb-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {filteredSponsors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredSponsors.map((sponsor, index) => (
                  <motion.div
                    key={sponsor.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 * index }}
                  >
                    <SponsorCard sponsor={sponsor} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  No sponsors found in this tier.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-20 bg-gradient-to-r from-orange-500 to-purple-600">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <Award className="w-16 h-16 text-white mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-white mb-6">
              Become a Partner
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join our growing network of sponsors and reach millions of cricket
              enthusiasts worldwide.
            </p>
            <button className="bg-white text-orange-600 px-8 py-4 rounded-full font-semibold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300">
              Contact Us
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
