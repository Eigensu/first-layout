"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, Users, TrendingUp, Shield, ArrowRight } from "lucide-react";
import { PillNavbar } from "@/components/navigation/PillNavbar";
import { UserMenu } from "@/components/navigation/UserMenu";
import { MobileUserMenu } from "@/components/navigation/MobileUserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/Loading";

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const features = useMemo(
    () => [
      {
        icon: Trophy,
        title: "Compete & Win",
        description:
          "Build your dream cricket team and compete in fantasy leagues",
      },
      {
        icon: Users,
        title: "Team Builder",
        description:
          "Strategic player selection with real-time stats and insights",
      },
      {
        icon: TrendingUp,
        title: "Live Leaderboards",
        description: "Track your ranking and compete with players worldwide",
      },
      {
        icon: Shield,
        title: "Secure Platform",
        description: "Safe and fair gameplay with advanced analytics",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-white">
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-primary-50 to-gray-50">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Loading Wall-E Arena...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Top Navbar with standalone Join Us button on the right */}
          <div className="relative z-50 mt-4 mb-6">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
              <div className="sm:block sm:relative">
                <PillNavbar
                  className=""
                  mobileMenuContent={
                    isAuthenticated ? (
                      <MobileUserMenu />
                    ) : (
                      <Link
                        href="/auth/login"
                        className="block w-full text-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-[0_0_20px_rgba(191,171,121,0.35)] transition"
                      >
                        Join Us
                      </Link>
                    )
                  }
                />

                {/* Desktop: Show UserMenu/Join absolutely positioned */}
                <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2">
                  {isAuthenticated ? (
                    <UserMenu />
                  ) : (
                    <Link
                      href="/auth/login"
                      className="inline-flex items-center rounded-full bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-2.5 text-sm font-semibold shadow hover:shadow-[0_0_20px_rgba(191,171,121,0.35)] transition"
                    >
                      Join Us
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Hero Section */}
          <section className="relative rounded-3xl mx-4 mb-8 sm:mb-10">
            {/* Content Container */}
            <div className="relative z-10 container mx-auto px-4 sm:px-6 max-w-screen-xl">
              <div className="grid md:grid-cols-2 gap-12 items-center py-16 sm:py-20 lg:py-24">
                {/* Column 1: Text */}
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8 }}
                  className="text-center md:text-left"
                >
                  <h1 className="text-4xl sm:text-5xl lg:text-5xl font-extrabold text-primary-700 tracking-tight leading-tight mb-4">
                    Cricket Fantasy League
                  </h1>
                  <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-xl mx-auto md:mx-0 leading-relaxed">
                    Build your dream team, compete with friends, and rise to the
                    top!
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start items-center">
                    {isAuthenticated ? (
                      <Link
                        href="/demo"
                        className="inline-flex items-center px-10 py-4 rounded-full text-lg font-semibold text-white bg-gradient-to-r from-primary-500 via-accent-500 to-accent-400 shadow-lg hover:shadow-[0_0_20px_rgba(191,171,121,0.5)] transition-all duration-300 group"
                      >
                        Make Your Team Now
                        <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    ) : (
                      <Link
                        href="/auth/login"
                        className="inline-flex items-center px-10 py-4 rounded-full text-lg font-semibold text-white bg-gradient-to-r from-primary-500 via-accent-500 to-accent-400 shadow-lg hover:shadow-[0_0_20px_rgba(191,171,121,0.5)] transition-all duration-300 group"
                      >
                        Get Started
                        <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    )}
                  </div>
                </motion.div>

                {/* Column 2: Visual Placeholder */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="hidden md:flex justify-center items-center"
                >
                  <div className="w-full h-80 bg-gradient-to-br from-primary-100 to-primary-50 rounded-2xl flex items-center justify-center border border-primary-200 shadow-lg">
                    <div className="text-center">
                      <Image
                        src="/logo.jpeg"
                        alt="Wall-E Arena"
                        width={200}
                        height={200}
                        className="rounded-3xl shadow-2xl object-cover mx-auto mb-4"
                        priority
                      />
                      <p className="text-primary-700 text-2xl font-bold">
                        Wall-E Arena
                      </p>
                      <p className="text-sm text-primary-600 mt-2">
                        Your Fantasy Cricket Partner
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-16 bg-gradient-to-br from-primary-200 via-primary-100 to-primary-300 relative rounded-3xl mx-4 mb-10 sm:mb-12">
            <div className="container mx-auto px-4 sm:px-6 max-w-screen-xl">
              <div className="text-center mb-10 sm:mb-14">
                <h2 className="text-5xl font-extrabold text-center bg-gradient-to-r from-primary-500 to-accent-600 bg-clip-text text-transparent leading-tight pb-1 mb-8">
                  Why Choose Us?
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Experience the most engaging cricket fantasy platform with
                  powerful features
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {features.map((feature, index) => {
                  const Icon = feature.icon as React.ComponentType<{
                    className?: string;
                  }>;
                  return (
                    <div
                      key={feature.title}
                      className="relative bg-white/70 backdrop-blur-lg border border-primary-100 rounded-2xl p-8 shadow-md"
                    >
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center mb-4 shadow-inner">
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="relative py-20 bg-gradient-to-br from-primary-600 via-accent-500 to-accent-400 text-white overflow-hidden rounded-3xl mx-4 mb-8 sm:mb-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_60%)]" />
            <div className="container mx-auto px-6 text-center relative z-10 max-w-screen-xl">
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
                    href="/dashboard"
                    className="inline-flex items-center bg-white text-primary-600 font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] transition-all duration-300 animate-pulse-slow"
                  >
                    Visit Your Dashboard
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}
