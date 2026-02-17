"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Users, TrendingUp, Shield, ArrowRight } from "lucide-react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { Footer } from "@/components";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/Loading";
import { PageContainer, PageSection } from "@/components/ui/PageContainer";
import {
  publicContestsApi,
  type Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import {
  getActiveCarouselImages,
  type CarouselImage,
} from "@/lib/api/public/carousel";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { ContestCard } from "@/components/home/ContestCard";

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeContests, setActiveContests] = useState<Contest[]>([]);
  const [loadingContests, setLoadingContests] = useState(false);
  const [contestsError, setContestsError] = useState<string | null>(null);
  const [joinedContestIds, setJoinedContestIds] = useState<Set<string>>(
    new Set(),
  );
  const [liveContests, setLiveContests] = useState<Contest[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[]>([]);
  const [loadingCarousel, setLoadingCarousel] = useState(true);

  useEffect(() => {
    const loadActive = async () => {
      try {
        setLoadingContests(true);
        setContestsError(null);
        const res = await publicContestsApi.list({
          status: "ongoing",
          page_size: 8,
        });
        setActiveContests(res.contests || []);
      } catch (e: any) {
        setContestsError(e?.message || "Failed to load contests");
      } finally {
        setLoadingContests(false);
      }
    };
    loadActive();
  }, []);

  // Load carousel images - use sponsor logos as temporary carousel
  useEffect(() => {
    const loadCarousel = async () => {
      try {
        setLoadingCarousel(true);

        // Try to get carousel images first
        let images = await getActiveCarouselImages();

        // If no carousel images, use sponsor logos as carousel
        if (images.length === 0) {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/sponsors/?active=true&page_size=10`,
            );
            if (response.ok) {
              const data = await response.json();
              // Convert sponsors to carousel format
              images = data.sponsors.map((sponsor: any, index: number) => ({
                _id: sponsor._id,
                title: sponsor.name,
                subtitle: sponsor.description || `${sponsor.tier} Sponsor`,
                image_url: sponsor.logo,
                link_url: sponsor.website,
                display_order: index,
                active: true,
                created_at: sponsor.created_at,
                updated_at: sponsor.updated_at,
              }));
            }
          } catch (e) {
            console.error("Failed to load sponsors for carousel:", e);
          }
        }

        setCarouselImages(images);
      } catch (e) {
        console.error("Failed to load carousel images:", e);
      } finally {
        setLoadingCarousel(false);
      }
    };
    loadCarousel();
  }, []);

  useEffect(() => {
    const loadLive = async () => {
      try {
        setLoadingLive(true);
        const res = await publicContestsApi.list({
          status: "live",
          page_size: 8,
        });
        setLiveContests(res.contests || []);
      } catch {
        // ignore live failures separately for now
      } finally {
        setLoadingLive(false);
      }
    };
    loadLive();
  }, []);

  // Detect contests the user is enrolled in
  useEffect(() => {
    const loadEnrollments = async () => {
      try {
        const mine: EnrollmentResponse[] =
          await publicContestsApi.myEnrollments();
        const ids = new Set<string>(mine.map((e) => e.contest_id));
        setJoinedContestIds(ids);
      } catch {
        // ignore when unauthenticated or endpoint unavailable
      }
    };
    loadEnrollments();
  }, []);
  const features = useMemo(
    () => [
      {
        icon: Trophy,
        title: "Compete & Win",
        description: "Build your team and compete",
      },
      {
        icon: Users,
        title: "Team Builder",
        description: "Strategic picks with live stats",
      },
      {
        icon: TrendingUp,
        title: "Live Leaderboards",
        description: "Track rankings worldwide",
      },
      {
        icon: Shield,
        title: "Secure Platform",
        description: "Safe and fair gameplay",
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen">
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-bg-body">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-text-muted">Loading Wall-E Arena...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Top Navbar */}
          <PillNavbar
            className=""
            mobileMenuContent={isAuthenticated ? <MobileUserMenu /> : undefined}
          />

          {/* Spacer to prevent content from hiding under fixed navbar */}
          <div className="h-20"></div>

          {/* Hero Section - Full Width Carousel */}
          <PageSection className="relative mb-8 sm:mb-10">
            <PageContainer className="relative z-10">
              {loadingCarousel ? (
                <div className="w-full h-96 md:h-[500px] bg-gradient-to-br from-primary-100 to-primary-50 rounded-3xl flex items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : carouselImages.length > 0 ? (
                <HeroCarousel images={carouselImages} />
              ) : (
                // Fallback hero section when no carousel images
                <div className="w-full h-64 md:h-80 bg-gradient-to-br from-primary-100 to-primary-50 rounded-3xl flex items-center justify-center border border-primary-200 shadow-lg">
                  <div className="text-center px-6">
                    <Image
                      src="/logo.jpeg"
                      alt="Wall-E Arena"
                      width={200}
                      height={200}
                      className="rounded-3xl shadow-2xl object-cover mx-auto mb-6"
                      priority
                    />
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-primary-700 tracking-tight leading-tight mb-4">
                      World Tower Premier League
                    </h1>
                    <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-xl mx-auto leading-relaxed">
                      Build your dream team, compete with friends, and rise to
                      the top!
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                      {isAuthenticated ? (
                        <Link
                          href="/contests"
                          className="inline-flex items-center px-10 py-4 rounded-full text-lg font-semibold text-white bg-gradient-brand shadow-lg hover:shadow-pink-strong transition-all duration-300 group"
                        >
                          Explore Contests
                          <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      ) : (
                        <Link
                          href="/auth/login"
                          className="inline-flex items-center px-10 py-4 rounded-full text-lg font-semibold text-white bg-gradient-brand shadow-lg hover:shadow-pink-strong transition-all duration-300 group"
                        >
                          Get Started
                          <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </PageContainer>
          </PageSection>

          {/* Contests Section - Merged Ongoing and Live */}
          <PageSection fullBleed className="mb-10 sm:mb-12">
            <PageContainer>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white bg-clip-text text-transparent mb-4">
                Contests
              </h2>
              {contestsError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">
                  {contestsError}
                </div>
              )}
              {loadingContests || loadingLive ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-40 bg-white rounded-2xl shadow animate-pulse"
                    />
                  ))}
                </div>
              ) : activeContests.length === 0 && liveContests.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 text-gray-600">
                  No contests available right now. Check back soon!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
                  {/* Ongoing Contests */}
                  {activeContests.map((c) => (
                    <ContestCard
                      key={c.id}
                      contest={c}
                      status="ongoing"
                      isJoined={joinedContestIds.has(c.id)}
                      isAuthenticated={isAuthenticated}
                    />
                  ))}
                  {/* Live Contests */}
                  {liveContests.map((c) => (
                    <ContestCard
                      key={c.id}
                      contest={c}
                      status="live"
                      isJoined={joinedContestIds.has(c.id)}
                      isAuthenticated={isAuthenticated}
                    />
                  ))}
                </div>
              )}
            </PageContainer>
          </PageSection>

          {/* Features Section */}
          <PageSection
            fullBleed
            className="py-16 bg-gradient-to-br from-primary-200 via-primary-100 to-primary-300 relative rounded-3xl mb-10 sm:mb-12"
          >
            <PageContainer>
              <div className="text-center mb-10 sm:mb-14">
                <h2 className="text-4xl font-extrabold text-center text-text-muted leading-tight pb-1 mb-8">
                  Why Choose Us?
                </h2>
                <p className="text-lg text-text-muted max-w-2xl mx-auto">
                  Experience the most engaging cricket fantasy platform with
                  powerful features
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-8">
                {features.map((feature, index) => {
                  const Icon = feature.icon as React.ComponentType<{
                    className?: string;
                  }>;
                  return (
                    <div
                      key={feature.title}
                      className="relative bg-white/70 backdrop-blur-lg border border-primary-100 rounded-2xl p-4 sm:p-6 lg:p-8 shadow-md"
                    >
                      <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl bg-gradient-primary flex items-center justify-center mb-2 sm:mb-3 lg:mb-4 shadow-inner">
                        <Icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
                      </div>
                      <h3 className="text-sm sm:text-lg lg:text-xl font-semibold text-gray-900 mb-1 sm:mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-xs sm:text-sm lg:text-base text-gray-600">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </PageContainer>
          </PageSection>

          {/* CTA Section */}
          <PageSection
            fullBleed
            className="relative py-20 bg-gradient-primary text-white overflow-hidden rounded-3xl mb-8 sm:mb-10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_60%)]" />
            <PageContainer className="text-center relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
              >
                <h2 className="text-4xl sm:text-5xl font-bold mb-6 drop-shadow-md">
                  Ready to Play?
                </h2>
                <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
                  Join thousands of cricket fans and start your fantasy league
                  journey today
                </p>
                {isAuthenticated ? (
                  <Link
                    href="/contests"
                    className="inline-flex items-center bg-white text-primary-600 font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] transition-all duration-300 animate-pulse-slow"
                  >
                    Explore Contests
                    <ArrowRight className="ml-2" />
                  </Link>
                ) : (
                  <Link
                    href="/auth/register"
                    className="inline-flex items-center bg-white text-primary-600 font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] transition-all duration-300 animate-pulse-slow"
                  >
                    Create Your Team Now
                  </Link>
                )}
              </motion.div>
            </PageContainer>
          </PageSection>
        </>
      )}
      <Footer />
    </div>
  );
}
