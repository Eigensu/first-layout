import React from "react";
import {
  StepCard,
  PlayerCard,
  CaptainSelectionCard,
  Button,
  Player,
} from "@/components";

interface CaptainSelectionStepProps {
  currentStep: number;
  selectedPlayers: string[];
  players: Player[];
  captainId: string;
  viceCaptainId: string;

  onSetCaptain: (id: string, role: string) => void;
  onSetViceCaptain: (id: string, role: string) => void;
  onReplace: (id: string) => void;
  onFinalize: () => void;
}

export const CaptainSelectionStep: React.FC<CaptainSelectionStepProps> = ({
  currentStep,
  selectedPlayers,
  players,
  captainId,
  viceCaptainId,
  onSetCaptain,
  onSetViceCaptain,
  onReplace,
  onFinalize,
}) => {
  return (
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
              {(() => {
                // Extract filtered players to avoid duplication
                const selectedPlayersList = players.filter((player) =>
                  selectedPlayers.includes(player.id)
                );

                return (
                  <>
                    {/* Mobile: Compact Cards */}
                    <div className="md:hidden space-y-1.5">
                      {selectedPlayersList.map((player: Player) => (
                        <CaptainSelectionCard
                          key={player.id}
                          player={player}
                          isCaptain={player.id === captainId}
                          isViceCaptain={player.id === viceCaptainId}
                          onSetCaptain={(id) => onSetCaptain(id, "captain")}
                          onSetViceCaptain={(id) =>
                            onSetViceCaptain(id, "vice_captain")
                          }
                        />
                      ))}
                    </div>

                    {/* Desktop/Tablet: Regular Cards */}
                    <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedPlayersList.map((player: Player) => (
                        <PlayerCard
                          key={player.id}
                          player={player}
                          isSelected={true}
                          isCaptain={player.id === captainId}
                          isViceCaptain={player.id === viceCaptainId}
                          onSelect={() => {}}
                          onSetCaptain={(id) => onSetCaptain(id, "captain")}
                          onSetViceCaptain={(id) =>
                            onSetViceCaptain(id, "vice_captain")
                          }
                          onReplace={onReplace}
                          showActions={true}
                          variant="captain"
                        />
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="flex justify-center mt-6">
                <Button
                  variant="primary"
                  onClick={onFinalize}
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
  );
};
