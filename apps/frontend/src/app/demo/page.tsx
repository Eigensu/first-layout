"use client";

import { useState } from "react";
import {
  PlayerCard,
  PlayerList,
  StepCard,
  ProgressIndicator,
  Button,
  Badge,
  TopNavigation,
  Card,
  Avatar,
} from "@/components";
import type { Player } from "@/components";

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
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string>("");
  const [viceCaptainId, setViceCaptainId] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(1);

  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length < 11) {
        return [...prev, playerId];
      }
      return prev;
    });
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
      <TopNavigation
        title="Component Demo"
        subtitle="Enhanced WalleFantasy UI Components"
        actions={
          <div className="flex items-center space-x-3">
            <Badge variant="primary">Demo Mode</Badge>
            <Button variant="ghost" size="sm">
              Back to Home
            </Button>
          </div>
        }
        className="bg-white/80 backdrop-blur-sm shadow-soft"
      />

      <main className="container-responsive py-8">
        <div className="space-y-8">
          {/* Progress Section */}
          <div className="max-w-2xl mx-auto">
            <ProgressIndicator
              currentStep={currentStep}
              totalSteps={3}
              className="mb-8"
            />
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
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium text-gray-700">
                  Players Selected: {selectedPlayers.length}/11
                </h4>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlayers([])}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCurrentStep(2)}
                    disabled={selectedPlayers.length === 0}
                  >
                    Continue
                  </Button>
                </div>
              </div>

              <PlayerList
                players={mockPlayers}
                selectedPlayers={selectedPlayers}
                onPlayerSelect={handlePlayerSelect}
                maxSelections={11}
                compact={true}
              />
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
          </StepCard>

          {/* Step 3: Team Summary */}
          <StepCard
            stepNumber={3}
            title="Team Summary"
            description="Review your final team selection"
            isActive={currentStep === 3}
            isCompleted={false}
          >
            <div className="space-y-6">
              {selectedPlayers.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-gradient-to-br from-success-50 to-success-100 rounded-xl p-4 border border-success-200">
                      <div className="text-2xl font-bold text-success-700 mb-1">
                        {selectedPlayers.length}
                      </div>
                      <div className="text-sm text-success-600">
                        Players Selected
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-warning-50 to-warning-100 rounded-xl p-4 border border-warning-200">
                      <div className="text-2xl font-bold text-warning-700 mb-1">
                        {captainId ? "1" : "0"}
                      </div>
                      <div className="text-sm text-warning-600">Captain</div>
                    </div>

                    <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-xl p-4 border border-secondary-200">
                      <div className="text-2xl font-bold text-secondary-700 mb-1">
                        {viceCaptainId ? "1" : "0"}
                      </div>
                      <div className="text-sm text-secondary-600">
                        Vice-Captain
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-4 border border-primary-200">
                      <div className="text-2xl font-bold text-primary-700 mb-1">
                        ₹
                        {mockPlayers
                          .filter((p) => selectedPlayers.includes(p.id))
                          .reduce((sum, p) => sum + p.price, 0)
                          .toFixed(1)}
                        M
                      </div>
                      <div className="text-sm text-primary-600">Team Value</div>
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
                              <Avatar name={player.name} size="sm" />
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

                  <div className="flex justify-center">
                    <Button variant="primary" size="lg" className="shadow-glow">
                      Submit Team & Join Contest
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No team selected
                </div>
              )}
            </div>
          </StepCard>
        </div>
      </main>
    </div>
  );
}
