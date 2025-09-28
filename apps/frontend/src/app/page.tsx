"use client";

import { useState } from "react";
import {
  NavigationTabs,
  TopNavigation,
  StepCard,
  ProgressIndicator,
  Button,
  Badge,
} from "@/components";

// Icons (placeholder - will be replaced with proper icon library)
const HomeIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const TrophyIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
    />
  </svg>
);

const UsersIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
    />
  </svg>
);

const StarIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
    />
  </svg>
);

export default function Home() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentStep, setCurrentStep] = useState(1);

  const tabs = [
    { id: "home", label: "Home", icon: <HomeIcon /> },
    {
      id: "leaderboards",
      label: "Leaderboards",
      icon: <TrophyIcon />,
      badge: 3,
    },
    { id: "myteam", label: "My Team", icon: <UsersIcon /> },
    { id: "sponsors", label: "Sponsors", icon: <StarIcon /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header */}
      <TopNavigation
        title="WalleFantasy"
        subtitle="Tyrant Premier League Season 10"
        actions={
          <div className="flex items-center space-x-3">
            <Badge variant="success" className="animate-pulse">
              Live Contest
            </Badge>
            <Button variant="ghost" size="sm">
              Sign Out
            </Button>
          </div>
        }
        className="bg-white/80 backdrop-blur-sm shadow-soft"
      />

      {/* Navigation */}
      <NavigationTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="sticky top-0 z-40"
      />

      {/* Main Content */}
      <main className="container-responsive py-8">
        {activeTab === "home" && (
          <div className="space-y-8">
            {/* Welcome Section */}
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-6xl font-bold font-heading mb-4">
                <span className="gradient-text">Welcome to</span>
                <br />
                <span className="text-gray-900">WalleFantasy</span>
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Create your dream cricket team and compete with players
                worldwide. Experience the thrill of fantasy sports with our
                modern platform.
              </p>
              <div className="mt-8">
                <ProgressIndicator
                  currentStep={currentStep}
                  totalSteps={4}
                  className="max-w-md mx-auto"
                />
              </div>
            </div>

            {/* Team Creation Steps */}
            <div className="grid gap-8 max-w-4xl mx-auto">
              <StepCard
                stepNumber={1}
                title="Access Create Team Page"
                description="Navigate to the team creation interface to start building your fantasy team"
                isActive={currentStep === 1}
                isCompleted={currentStep > 1}
              >
                <div className="bg-gradient-to-r from-primary-50 to-orange-50 rounded-xl p-4 border border-primary-100">
                  <p className="text-sm text-gray-700 mb-3">
                    Click on <strong>&quot;Create Team&quot;</strong> in the
                    navigation bar above to begin your journey.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCurrentStep(2)}
                    className="w-full sm:w-auto"
                  >
                    Go to Create Team →
                  </Button>
                </div>
              </StepCard>

              <StepCard
                stepNumber={2}
                title="Select Your Favorite Players"
                description="Choose 11 players from the available pool within budget constraints"
                isActive={currentStep === 2}
                isCompleted={currentStep > 2}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-success-600">
                        4
                      </div>
                      <div className="text-xs text-gray-600">Batsmen</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-error-600">4</div>
                      <div className="text-xs text-gray-600">Bowlers</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-primary-600">
                        2
                      </div>
                      <div className="text-xs text-gray-600">All-Rounders</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-warning-600">
                        1
                      </div>
                      <div className="text-xs text-gray-600">Wicket-Keeper</div>
                    </div>
                  </div>
                  {currentStep >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentStep(3)}
                      className="w-full sm:w-auto"
                    >
                      Continue to Captain Selection →
                    </Button>
                  )}
                </div>
              </StepCard>

              <StepCard
                stepNumber={3}
                title="Choose Captain & Vice-Captain"
                description="Assign special roles to maximize your team's scoring potential"
                isActive={currentStep === 3}
                isCompleted={currentStep > 3}
              >
                <div className="bg-gradient-to-r from-warning-50 to-secondary-50 rounded-xl p-4 border border-warning-200">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-warning-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-white font-bold text-sm">C</span>
                      </div>
                      <h4 className="font-semibold text-gray-900">Captain</h4>
                      <p className="text-sm text-gray-600">2x Points</p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-secondary-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-white font-bold text-sm">VC</span>
                      </div>
                      <h4 className="font-semibold text-gray-900">
                        Vice-Captain
                      </h4>
                      <p className="text-sm text-gray-600">1.5x Points</p>
                    </div>
                  </div>
                  {currentStep >= 3 && (
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCurrentStep(4)}
                        className="w-full sm:w-auto"
                      >
                        Finalize Team →
                      </Button>
                    </div>
                  )}
                </div>
              </StepCard>

              <StepCard
                stepNumber={4}
                title="Update & Submit Your Team"
                description="Review your selections and submit your team for the contest"
                isActive={currentStep === 4}
                isCompleted={false}
              >
                <div className="bg-gradient-to-r from-success-50 to-primary-50 rounded-xl p-4 border border-success-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-700 mb-2">
                        Ready to compete? Submit your team and track performance
                        on the leaderboards!
                      </p>
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="flex items-center text-success-600">
                          <span className="w-2 h-2 bg-success-500 rounded-full mr-2"></span>
                          Budget Used: ₹95.5M / ₹100M
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                          Players Selected: 11/11
                        </div>
                      </div>
                    </div>
                  </div>
                  {currentStep >= 4 && (
                    <div className="mt-4">
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full sm:w-auto shadow-glow"
                      >
                        Submit Team & Join Contest
                      </Button>
                    </div>
                  )}
                </div>
              </StepCard>
            </div>

            {/* Quick Stats */}
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <UsersIcon />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  10,000+
                </h3>
                <p className="text-gray-600">Active Players</p>
              </div>

              <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="w-16 h-16 bg-gradient-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <TrophyIcon />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  ₹50 Lakh
                </h3>
                <p className="text-gray-600">Total Prizes</p>
              </div>

              <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="w-16 h-16 bg-gradient-to-br from-success-400 to-success-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <StarIcon />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Live</h3>
                <p className="text-gray-600">Match Updates</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "leaderboards" && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-br from-warning-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <TrophyIcon />
            </div>
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
              Leaderboards
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              View your team&apos;s performance and compete with other players
              for the top positions.
            </p>
            <Button variant="primary">View Live Rankings</Button>
          </div>
        )}

        {activeTab === "myteam" && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-secondary rounded-3xl flex items-center justify-center mx-auto mb-6">
              <UsersIcon />
            </div>
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
              My Teams
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Manage your fantasy teams, view player statistics, and track your
              performance.
            </p>
            <Button variant="secondary">Manage Teams</Button>
          </div>
        )}

        {activeTab === "sponsors" && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-400 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <StarIcon />
            </div>
            <h2 className="text-3xl font-bold font-heading text-gray-900 mb-4">
              Our Sponsors
            </h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Meet our amazing sponsors who make WalleFantasy possible.
            </p>
            <Button variant="outline">View Sponsors</Button>
          </div>
        )}
      </main>
    </div>
  );
}
