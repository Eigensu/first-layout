import { motion } from "framer-motion";
import { ExternalLink, Award } from "lucide-react";
import Image from "next/image";

export interface Sponsor {
  id: string;
  name: string;
  logo: string;
  tier: "platinum" | "gold" | "silver" | "bronze";
  description: string;
  website: string;
  featured?: boolean;
}

interface SponsorCardProps {
  sponsor: Sponsor;
  featured?: boolean;
}

const tierColors = {
  platinum: {
    gradient: "from-slate-300 via-slate-400 to-slate-500",
    bg: "bg-gradient-to-br from-slate-50 to-slate-100",
    badge: "bg-gradient-to-r from-slate-400 to-slate-600",
    ring: "ring-slate-300",
  },
  gold: {
    gradient: "from-yellow-300 via-yellow-400 to-yellow-500",
    bg: "bg-gradient-to-br from-yellow-50 to-yellow-100",
    badge: "bg-gradient-to-r from-yellow-400 to-yellow-600",
    ring: "ring-yellow-300",
  },
  silver: {
    gradient: "from-gray-300 via-gray-400 to-gray-500",
    bg: "bg-gradient-to-br from-gray-50 to-gray-100",
    badge: "bg-gradient-to-r from-gray-400 to-gray-600",
    ring: "ring-gray-300",
  },
  bronze: {
    gradient: "from-amber-600 via-amber-700 to-amber-800",
    bg: "bg-gradient-to-br from-amber-50 to-amber-100",
    badge: "bg-gradient-to-r from-amber-600 to-amber-800",
    ring: "ring-amber-300",
  },
};

export function SponsorCard({ sponsor, featured = false }: SponsorCardProps) {
  const tierColor = tierColors[sponsor.tier];

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className={`relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${
        featured ? "ring-2 " + tierColor.ring : "border border-gray-200"
      }`}
    >
      {/* Featured Badge */}
      {featured && (
        <div className="absolute top-4 right-4 z-10">
          <div
            className={`${tierColor.badge} text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg`}
          >
            <Award className="w-3 h-3" />
            Featured
          </div>
        </div>
      )}

      {/* Tier Badge */}
      <div
        className={`absolute top-4 left-4 z-10 ${tierColor.badge} text-white px-3 py-1 rounded-full text-xs font-bold uppercase shadow-lg`}
      >
        {sponsor.tier}
      </div>

      {/* Logo Container with Gradient Background */}
      <div
        className={`relative h-48 ${tierColor.bg} flex items-center justify-center p-8`}
      >
        <div className="relative w-full h-full">
          <Image
            src={sponsor.logo}
            alt={`${sponsor.name} logo`}
            fill
            className="object-contain drop-shadow-lg"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1">
          {sponsor.name}
        </h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
          {sponsor.description}
        </p>

        {/* Visit Website Button */}
        <a
          href={sponsor.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary-700 hover:text-primary-800 font-medium text-sm group transition-colors duration-200"
        >
          Visit Website
          <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-200" />
        </a>
      </div>

      {/* Bottom Gradient Accent */}
      <div className={`h-1 w-full bg-gradient-to-r ${tierColor.gradient}`} />
    </motion.div>
  );
}
