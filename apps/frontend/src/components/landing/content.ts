import { Shield, Trophy, Users, Zap, type LucideIcon } from "lucide-react";

/**
 * The root domain's landing content, carried over from the retired
 * walle-landing site (its slides lived in that site's own backend). Edit the
 * copy here; tournaments come from the registry (GET /api/tournaments).
 */

export interface HeroSlide {
  imageUrl: string;
  headline: string;
  description: string;
  // CSS object-position, so a photo keeps its subject in frame.
  imagePosition: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    imageUrl:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop",
    headline: "Grand Finals Live",
    description:
      "Watch the top 10 teams battle it out for the ultimate championship pool. The action is live now!",
    imagePosition: "center",
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop",
    headline: "New Season Starting Now",
    description:
      "Ranked matchmaking is reset. Climb the leaderboard and earn exclusive rewards.",
    imagePosition: "top",
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=2070&auto=format&fit=crop",
    headline: "Build Your Dream Roster",
    description:
      "Select the top players globally and dominate the fantasy leagues this weekend.",
    imagePosition: "center",
  },
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Trophy,
    title: "Live Tournaments",
    description: "Compete in real-time fantasy tournaments with players worldwide.",
  },
  {
    icon: Users,
    title: "Build Your Squad",
    description: "Create your dream team by selecting the best players strategically.",
  },
  {
    icon: Zap,
    title: "Instant Results",
    description: "Track live scores and see your rankings update in real-time.",
  },
  {
    icon: Shield,
    title: "Secure Platform",
    description:
      "Your data and transactions are protected with industry-standard security.",
  },
];

export const SUPPORT_EMAIL = "support@wallearena.com";
export const SUPPORT_HOURS = "Mon - Fri: 9AM - 6PM IST";
