import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FEATURES } from "./content";
import { HeroCarousel } from "./HeroCarousel";
import { LandingFooter } from "./LandingFooter";
import { LandingNavbar } from "./LandingNavbar";
import { TournamentDirectory } from "./TournamentDirectory";

/** wallearena.com itself: the directory of every tournament's subdomain. */
export function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-bg-body text-text-main">
      <LandingNavbar />

      <section className="relative w-full">
        <HeroCarousel />
      </section>

      <section id="tournaments" className="pb-20 pt-8 bg-bg-elevated scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
              Active Tournaments
            </h2>
            <p className="text-text-muted text-lg max-w-2xl mx-auto">
              Join live competitions and showcase your fantasy sports skills
            </p>
          </div>
          <TournamentDirectory />
        </div>
      </section>

      <section id="features" className="py-20 scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
              Why Choose Wall-E Arena?
            </h2>
            <p className="text-text-muted text-lg max-w-2xl mx-auto">
              Experience the most engaging fantasy sports platform with powerful
              features designed for winners
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-2xl bg-bg-elevated border border-border-subtle hover:border-border-strong transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-accent-pink-tonal flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-accent-pink-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-brand p-12 md:p-16 text-center">
            <div className="max-w-2xl mx-auto">
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                Ready to Start Winning?
              </h2>
              <p className="text-text-main text-lg mb-8">
                Join thousands of players competing in fantasy tournaments. Build
                your team and prove your skills.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-text-main text-bg-body font-semibold px-8 py-3.5 rounded-full transition-transform hover:scale-105"
              >
                Get Started Today
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
