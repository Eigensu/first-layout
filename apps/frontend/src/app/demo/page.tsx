"use client";

import { useMemo, useState } from "react";
import {
  PlayerCard,
  PlayerList,
  StepCard,
  ProgressIndicator,
  Button,
  Badge,
  PillNavbar,
  Card,
  Avatar,
} from "@/components";
import type { Player } from "@/components";
import { UserMenu } from "@/components/navigation/UserMenu";
import { useAuth } from "@/contexts/AuthContext";

const mockPlayers: Player[] = [
  {
    id: "1",
    name: "Virat Kohli",
    role: "Batsman",
    team: "RCB",
    points: 287,
    price: 15.0,
    stats: { matches: 12, runs: 543, average: 45.25 },
  },
  {
    id: "2",
    name: "MS Dhoni",
    role: "Wicket-Keeper",
    team: "CSK",
    points: 234,
    price: 14.5,
    stats: { matches: 11, runs: 321, average: 35.67 },
  },
  {
    id: "3",
    name: "Jasprit Bumrah",
    role: "Bowler",
    team: "MI",
    points: 195,
    price: 11.5,
    stats: { matches: 10, wickets: 18, average: 1.8 },
  },
  {
    id: "4",
    name: "Hardik Pandya",
    role: "All-Rounder",
    team: "MI",
    points: 276,
    price: 13.0,
    stats: { matches: 12, runs: 298, wickets: 8, average: 24.83 },
  },
  {
    id: "5",
    name: "Rashid Khan",
    role: "Bowler",
    team: "GT",
    points: 189,
    price: 10.5,
    stats: { matches: 11, wickets: 15, average: 1.36 },
  },
  {
    id: "6",
    name: "Shikhar Dhawan",
    role: "Batsman",
    team: "PBKS",
    points: 198,
    price: 9.5,
    stats: { matches: 13, runs: 467, average: 35.92 },
  },
];

export default function DemoPage() {
  const { isAuthenticated } = useAuth();
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string>("");
  const [viceCaptainId, setViceCaptainId] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(1);
  const [activeRole, setActiveRole] = useState<string>("Batsman");

  // Progress through categories in order
  const ROLE_SEQUENCE = ["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"] as const;

  const ROLE_LIMITS = useMemo(
    () => ({
      "Batsman": 4,
      "Bowler": 4,
      "All-Rounder": 4,
      "Wicket-Keeper": 4,
    }),
    []
  );

  const normalizeRole = (role: string): string => {
    const r = role.toLowerCase();
    if (r === "batsman" || r === "batsmen") return "Batsman";
    if (r === "bowler") return "Bowler";
    if (r === "all-rounder" || r === "allrounder") return "All-Rounder";
    if (r === "wicket-keeper" || r === "wicketkeeper") return "Wicket-Keeper";
    return role;
  };

  const selectedCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedPlayers.forEach((id) => {
      const p = mockPlayers.find((mp) => mp.id === id);
      if (!p) return;
      const role = normalizeRole(p.role);
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [selectedPlayers]);

  const allRolesExactlyFour = useMemo(
    () => ROLE_SEQUENCE.every((r) => (selectedCountByRole[r] || 0) === 4),
    [selectedCountByRole]
  );

  const canNextForActiveRole = useMemo(
    () => (selectedCountByRole[activeRole] || 0) >= 1,
    [selectedCountByRole, activeRole]
  );

  const goToNextRole = () => {
    const idx = ROLE_SEQUENCE.indexOf(activeRole as typeof ROLE_SEQUENCE[number]);
    const next = ROLE_SEQUENCE[Math.min(idx + 1, ROLE_SEQUENCE.length - 1)];
    setActiveRole(next);
  };

  const goToPrevRole = () => {
    const idx = ROLE_SEQUENCE.indexOf(activeRole as typeof ROLE_SEQUENCE[number]);
    const prev = ROLE_SEQUENCE[Math.max(idx - 1, 0)];
    setActiveRole(prev);
  };

  const isFirstRole = useMemo(
    () => ROLE_SEQUENCE.indexOf(activeRole as typeof ROLE_SEQUENCE[number]) === 0,
    [activeRole]
  );

  // Gradient helper for Step 3 avatars (persist category colors across steps)
  const getRoleAvatarGradient = (role: string) => {
    const r = role.toLowerCase();
    if (r === "batsman" || r === "batsmen") return "bg-gradient-to-br from-amber-400 to-yellow-600";
    if (r === "bowler") return "bg-gradient-to-br from-blue-500 to-indigo-600";
    if (r === "all-rounder" || r === "allrounder") return "bg-gradient-to-br from-emerald-400 to-teal-600";
    if (r === "wicket-keeper" || r === "wicketkeeper") return "bg-gradient-to-br from-purple-500 to-pink-600";
    return undefined;
  };

  const handleClearAll = () => {
    setSelectedPlayers([]);
    setCaptainId("");
    setViceCaptainId("");
    setCurrentStep(1);
    setActiveRole("Batsman");
  };

  const handlePlayerSelect = (playerId: string) => {
    // Toggle selection; limits are enforced inside PlayerList via onBlockedSelect
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSetCaptain = (playerId: string) => {
    setCaptainId(playerId);
    if (viceCaptainId === playerId) {
      setViceCaptainId("");
    }
  };

  const handleSetViceCaptain = (playerId: string) => {
    setViceCaptainId(playerId);
    if (captainId === playerId) {
      setCaptainId("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header: Navbar + User menu */}
      <div className="relative z-50 py-5">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 relative">
          <PillNavbar />
          {isAuthenticated && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden md:block">
              <UserMenu />
            </div>
          )}
        </div>
      </div>

      {/* Hero Section */}
      <div className="px-4 mb-10">
        <div className="text-center max-w-3xl mx-auto mt-6">
          <h1 className="text-3xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-500">
            Build Your Dream Team
          </h1>
          <p className="mt-2 text-gray-600 text-base md:text-lg">
            Create the perfect fantasy cricket team and compete for glory!
          </p>
        </div>
      </div>

      <main className="container-responsive py-8">
        <div className="space-y-8">
          {/* Progress Section with Clear All on right */}
          <div className="max-w-3xl mx-auto mt-2 mb-10">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <ProgressIndicator
                  currentStep={currentStep}
                  totalSteps={3}
                  className=""
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleClearAll}
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Step 1: Player Selection */}
          <StepCard
            stepNumber={1}
            title="Select Players"
            description="Choose your fantasy cricket team from available players"
            isActive={currentStep === 1}
            isCompleted={currentStep > 1}
          >
            <div className="space-y-4">
              {/* Header with counts */}
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-gray-700">
                  Players Selected: {selectedPlayers.length}/16
                </h4>
                {/* Continue moved to bottom center */}
              </div>

              {/* Clear All moved to progress bar area */}

              {/* Role Filter Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(["Batsman", "Bowler", "All-Rounder", "Wicket-Keeper"] as const).map(
                  (role) => {
                    const limit = ROLE_LIMITS[role as keyof typeof ROLE_LIMITS];
                    const count = selectedCountByRole[role] || 0;
                    const isActive = activeRole === role;
                    return (
                      <Button
                        key={role}
                        variant={isActive ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => setActiveRole(role)}
                        className="rounded-full"
                      >
                        {role}
                        {limit !== undefined && (
                          <span className="ml-2 text-xs text-gray-600">
                            {(count || 0)}/{limit}
                          </span>
                        )}
                      </Button>
                    );
                  }
                )}
              </div>

              {/* Player List with constraints */}
              <PlayerList
                players={mockPlayers}
                selectedPlayers={selectedPlayers}
                onPlayerSelect={handlePlayerSelect}
                maxSelections={16}
                roleLimits={ROLE_LIMITS}
                filterRole={activeRole}
                sortByRole={true}
                onBlockedSelect={(reason) => alert(reason)}
                compact={true}
              />

              {/* Bottom actions: Previous + (Next or Continue) centered */}
              {activeRole === ROLE_SEQUENCE[ROLE_SEQUENCE.length - 1] ? (
                <div className="flex items-center justify-center mt-4">
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={goToPrevRole}
                      disabled={isFirstRole}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setCurrentStep(2)}
                      disabled={!((selectedCountByRole[activeRole] || 0) >= 1)}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center mt-4">
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={goToPrevRole}
                      disabled={isFirstRole}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={goToNextRole}
                      disabled={!canNextForActiveRole}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </StepCard>

          {/* Step 2: Captain Selection */}
          <StepCard
            stepNumber={2}
            title="Choose Captain & Vice-Captain"
            description="Select captain (2x points) and vice-captain (1.5x points)"
            isActive={currentStep === 2}
            isCompleted={currentStep > 2}
          >
            {currentStep === 2 ? (
              <div className="space-y-4">
                {selectedPlayers.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {mockPlayers
                        .filter((player) => selectedPlayers.includes(player.id))
                        .map((player) => (
                          <PlayerCard
                            key={player.id}
                            player={player}
                            isSelected={true}
                            isCaptain={player.id === captainId}
                            isViceCaptain={player.id === viceCaptainId}
                            onSelect={() => {}}
                            onSetCaptain={handleSetCaptain}
                            onSetViceCaptain={handleSetViceCaptain}
                            showActions={true}
                          />
                        ))}
                    </div>

                    <div className="flex justify-center mt-6">
                      <Button
                        variant="primary"
                        onClick={() => setCurrentStep(3)}
                        disabled={!captainId || !viceCaptainId}
                      >
                        Finalize Team
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Please select players first
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                Continue from Step 1 to configure Captain & Vice-Captain
              </div>
            )}
          </StepCard>

          {/* Step 3: Team Summary */}
          <StepCard
            stepNumber={3}
            title="Team Summary"
            description="Review your final team selection"
            isActive={currentStep === 3}
            isCompleted={false}
          >
            {currentStep === 3 ? (
              <div className="space-y-6">
                {selectedPlayers.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className={`${selectedPlayers.length > 0 ? "bg-gradient-to-br from-success-50 to-success-100 border-success-200" : "bg-gray-50 border-gray-200"} rounded-xl p-4 border`}>
                      <div className={`text-2xl font-bold mb-1 ${selectedPlayers.length > 0 ? "text-success-700" : "text-gray-700"}`}>
                        {selectedPlayers.length}
                      </div>
                      <div className={`text-sm ${selectedPlayers.length > 0 ? "text-success-600" : "text-gray-500"}`}>
                        Players Selected
                      </div>
                    </div>

                    <div className={`${captainId ? "bg-gradient-to-br from-warning-50 to-warning-100 border-warning-200" : "bg-gray-50 border-gray-200"} rounded-xl p-4 border`}>
                      <div className={`text-2xl font-bold mb-1 ${captainId ? "text-warning-700" : "text-gray-700"}`}>
                        {captainId ? "1" : "0"}
                      </div>
                      <div className={`text-sm ${captainId ? "text-warning-600" : "text-gray-500"}`}>Captain</div>
                    </div>

                    <div className={`${viceCaptainId ? "bg-gradient-to-br from-secondary-50 to-secondary-100 border-secondary-200" : "bg-gray-50 border-gray-200"} rounded-xl p-4 border`}>
                      <div className={`text-2xl font-bold mb-1 ${viceCaptainId ? "text-secondary-700" : "text-gray-700"}`}>
                        {viceCaptainId ? "1" : "0"}
                      </div>
                      <div className={`text-sm ${viceCaptainId ? "text-secondary-600" : "text-gray-500"}`}>
                        Vice-Captain
                      </div>
                    </div>

                    <div className={`${(mockPlayers.filter((p) => selectedPlayers.includes(p.id)).reduce((sum, p) => sum + p.price, 0) > 0) ? "bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200" : "bg-gray-50 border-gray-200"} rounded-xl p-4 border`}>
                      <div className={`text-2xl font-bold mb-1 ${(mockPlayers.filter((p) => selectedPlayers.includes(p.id)).reduce((sum, p) => sum + p.price, 0) > 0) ? "text-primary-700" : "text-gray-700"}`}>
                        ₹
                        {mockPlayers
                          .filter((p) => selectedPlayers.includes(p.id))
                          .reduce((sum, p) => sum + p.price, 0)
                          .toFixed(1)}
                        M
                      </div>
                      <div className={`text-sm ${(mockPlayers.filter((p) => selectedPlayers.includes(p.id)).reduce((sum, p) => sum + p.price, 0) > 0) ? "text-primary-600" : "text-gray-500"}`}>Team Value</div>
                    </div>
                  </div>

                  {/* Team Preview */}
                  <Card className="p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">
                      Your Dream Team
                    </h4>
                    <div className="space-y-3">
                      {mockPlayers
                        .filter((player) => selectedPlayers.includes(player.id))
                        .map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <Avatar name={player.name} size="sm" gradientClassName={getRoleAvatarGradient(player.role)} />
                              <div>
                                <div className="font-medium text-gray-900">
                                  {player.name}
                                  {player.id === captainId && (
                                    <Badge
                                      variant="warning"
                                      size="sm"
                                      className="ml-2"
                                    >
                                      Captain
                                    </Badge>
                                  )}
                                  {player.id === viceCaptainId && (
                                    <Badge
                                      variant="secondary"
                                      size="sm"
                                      className="ml-2"
                                    >
                                      Vice-Captain
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {player.role} • {player.team}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-success-600">
                                {player.points} pts
                              </div>
                              <div className="text-sm text-gray-500">
                                ₹{player.price}M
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </Card>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No team selected
                </div>
              )}
            </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                Finalize team in Step 2 to view summary
              </div>
            )}
          </StepCard>

          {/* Global Submit (always visible below steps) */}
          <div className="flex justify-center mt-6">
            <Button
              variant="primary"
              size="lg"
              className="shadow-glow"
              disabled={currentStep !== 3}
            >
              Submit Team & Join Contest
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
