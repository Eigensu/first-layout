import React from "react";
import { StepCard, Button, Card, Badge, Player } from "@/components";

interface TeamSummaryStepProps {
  currentStep: number;
  selectedPlayers: string[];
  players: Player[];
  teamName: string;
  onTeamNameChange: (name: string) => void;
  captainId: string;
  viceCaptainId: string;
  submitting: boolean;
  editMode: boolean;
  onSubmit: () => void;
}

export const TeamSummaryStep: React.FC<TeamSummaryStepProps> = ({
  currentStep,
  selectedPlayers,
  players,
  teamName,
  onTeamNameChange,
  captainId,
  viceCaptainId,
  submitting,
  editMode,
  onSubmit,
}) => {
  return (
    <>
      <StepCard
        stepNumber={3}
        title="Team Summary"
        description="Review your final team selection"
        isActive={currentStep === 3}
        isCompleted={false}
      >
        {currentStep === 3 ? (
          <div className="space-y-4 sm:space-y-6">
            {selectedPlayers.length > 0 ? (
              <>
                {/* Team Name Input */}
                <div className="mb-4 sm:mb-6">
                  <label
                    htmlFor="teamName"
                    className="block text-sm font-medium text-text-main mb-2"
                  >
                    Team Name
                  </label>
                  <input
                    type="text"
                    id="teamName"
                    value={teamName}
                    onChange={(e) => onTeamNameChange(e.target.value)}
                    className="w-full px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-border-subtle bg-bg-card text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-accent-pink-soft/40 focus:border-accent-pink-soft text-sm sm:text-base"
                    placeholder="Enter your full name"
                    maxLength={50}
                  />
                </div>

                {/* Team Preview */}
                <Card className="p-4 sm:p-6 bg-bg-card border border-border-subtle text-text-main">
                  <h4 className="text-base sm:text-lg font-semibold text-text-main mb-3 sm:mb-4">
                    Your Dream Team
                  </h4>
                  <div className="space-y-3">
                    {players
                      .filter((player) => selectedPlayers.includes(player.id))
                      .map((player: Player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between py-2 px-3 bg-bg-elevated rounded-lg border border-border-subtle"
                        >
                          <div>
                            <div className="font-medium text-text-main text-sm">
                              {player.name}
                            </div>
                            <div className="text-xs text-text-muted">
                              {player.team}
                            </div>
                          </div>
                          <div className="self-end">
                            {player.id === captainId && (
                              <Badge
                                variant="warning"
                                size="sm"
                                className="text-[10px] px-1.5 py-0 shadow-sm"
                              >
                                C
                              </Badge>
                            )}
                            {player.id === viceCaptainId && (
                              <Badge
                                variant="secondary"
                                size="sm"
                                className="text-[10px] px-1.5 py-0 shadow-sm"
                              >
                                VC
                              </Badge>
                            )}
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

      {/* Global Submit - Only shown in Step 3 */}
      {currentStep === 3 && (
        <div className="flex justify-center mt-6">
          <Button
            variant="primary"
            size="lg"
            className="shadow-glow"
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitting
              ? editMode
                ? "Saving..."
                : "Submitting..."
              : editMode
                ? "Save Changes"
                : "Submit Team"}
          </Button>
        </div>
      )}
    </>
  );
};
