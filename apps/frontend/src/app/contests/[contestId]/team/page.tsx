"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  PlayerCard,
  PlayerList,
  StepCard,
  ProgressIndicator,
  Button,
  Badge,
  Card,
  Avatar,
} from "@/components";
import type { Player } from "@/components";
import { useAuth } from "@/contexts/AuthContext";
import { LS_KEYS, ROUTES } from "@/common/consts";
import {
  createTeam,
  getUserTeams,
  getTeam,
  updateTeam,
  type TeamResponse,
} from "@/lib/api/teams";
import {
  publicContestsApi,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { useTeamBuilder } from "@/hooks/useTeamBuilder";

export default function ContestTeamBuilderPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const contestId = Array.isArray((params as any)?.contestId)
    ? (params as any).contestId[0]
    : (params as any)?.contestId;

  const {
    // data
    slots,
    players,
    loading,
    error,

    // selection state
    selectedPlayers,
    captainId,
    viceCaptainId,
    currentStep,
    activeSlotId,
    isStep1Collapsed,

    // derived
    SLOT_LIMITS,
    selectedCountBySlot,
    canNextForActiveSlot,
    isFirstSlot,

    // handlers
    setSelectedPlayers,
    setCaptainId,
    setViceCaptainId,
    setCurrentStep,
    setIsStep1Collapsed,
    setActiveSlotId,
    handleClearAll,
    handlePlayerSelect,
    handleSetCaptain,
    handleSetViceCaptain,
    goToNextSlot,
    goToPrevSlot,
  } = useTeamBuilder(typeof contestId === "string" ? contestId : undefined);

  // Team submission states
  const [submitting, setSubmitting] = useState(false);
  const [teamName, setTeamName] = useState("");

  // Selected contest is fixed from route
  const [selectedContestId, setSelectedContestId] = useState<string>("");

  // Enrolled contest (optional banner if already enrolled in this contest)
  const [enrolledHere, setEnrolledHere] = useState<boolean>(false);
  const [loadingEnrollment, setLoadingEnrollment] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentResponse | null>(null);

  // Existing team (enable edit mode when exists)
  const [existingTeam, setExistingTeam] = useState<TeamResponse | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Replace player modal state
  const [showReplace, setShowReplace] = useState(false);
  const [replaceTargetId, setReplaceTargetId] = useState<string>("");

  useEffect(() => {
    if (!contestId) return;
    setSelectedContestId(contestId);
  }, [contestId]);

  // Auth protection
  useEffect(() => {
    if (isAuthenticated === false && contestId) {
      router.push(
        `${ROUTES.LOGIN}?next=${encodeURIComponent(`/contests/${contestId}/team`)}`
      );
    }
  }, [isAuthenticated, contestId, router]);

  // Detect if already enrolled in this contest and load existing team if present
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!contestId) return;
      try {
        setLoadingEnrollment(true);
        const mine = await publicContestsApi.myEnrollments();
        if (!mounted) return;
        const e = Array.isArray(mine)
          ? mine.find((x) => x.contest_id === contestId)
          : undefined;
        setEnrolledHere(!!e);
        setEnrollment(e || null);
        const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
        if (e?.team_id && token) {
          try {
            setLoadingTeam(true);
            const t = await getTeam(e.team_id, token);
            if (mounted) setExistingTeam(t);
          } finally {
            if (mounted) setLoadingTeam(false);
          }
        } else if (token) {
          // Fallback: find team for this contest from user's teams
          try {
            setLoadingTeam(true);
            const list = await getUserTeams(token);
            const match = list.teams.find((t) => t.contest_id === contestId);
            if (mounted) setExistingTeam(match || null);
          } finally {
            if (mounted) setLoadingTeam(false);
          }
        } else {
          if (mounted) setExistingTeam(null);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoadingEnrollment(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [contestId]);

  const roleToSlotLabel = (role: string): string => role;

  // When an existing team is found, keep the page minimal (no edit pre-fill)
  useEffect(() => {
    if (!existingTeam) return;
    setEditMode(false);
    setTeamName(existingTeam.team_name || "");
  }, [existingTeam]);

  // Replace player handlers
  const openReplace = (playerId: string) => {
    setReplaceTargetId(playerId);
    setShowReplace(true);
  };

  const confirmReplace = (newPlayerId: string) => {
    setSelectedPlayers((prev) =>
      prev.map((id) => (id === replaceTargetId ? newPlayerId : id))
    );
    // Transfer captain/VC if target had it
    setCaptainId((c) => (c === replaceTargetId ? newPlayerId : c));
    setViceCaptainId((v) => (v === replaceTargetId ? newPlayerId : v));
    setShowReplace(false);
    setReplaceTargetId("");
  };
  const closeReplace = () => {
    setShowReplace(false);
    setReplaceTargetId("");
  };

  const handleSubmitTeam = async () => {
    if (!isAuthenticated) return;
    if (!teamName.trim()) {
      alert("Please enter a team name");
      return;
    }
    if (!captainId) {
      alert("Please select a captain");
      return;
    }
    if (!viceCaptainId) {
      alert("Please select a vice-captain");
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
      if (!token) {
        throw new Error("Not authenticated");
      }

      const teamData = {
        team_name: teamName,
        player_ids: selectedPlayers,
        captain_id: captainId,
        vice_captain_id: viceCaptainId,
        contest_id: selectedContestId || undefined,
      };
      const gotoTeams = () => {
        const qs = selectedContestId
          ? `?contest_id=${encodeURIComponent(String(selectedContestId))}`
          : "";
        router.push(`/teams${qs}`);
      };

      if (editMode && existingTeam) {
        // Update existing team
        await updateTeam(existingTeam.id, teamData, token);
        gotoTeams();
      } else {
        const created = await createTeam(teamData, token);
        if (selectedContestId) {
          try {
            await publicContestsApi.enroll(selectedContestId, created.id);
          } catch (e: any) {
            alert(
              e?.response?.data?.detail ||
                e?.message ||
                "Failed to enroll in contest"
            );
          }
        }
        gotoTeams();
      }
    } catch (err: any) {
      console.error("Failed to submit team:", err);
      alert(err.message || "Failed to submit team");
    } finally {
      setSubmitting(false);
    }
  };

  // If a team exists show minimal view instead of builder
  const showViewOnly = !!existingTeam;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Enrolled banner */}
      {enrolledHere && (
        <div className="px-4 sm:px-6 mb-3">
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3">
            You are already enrolled in this contest.
          </div>
        </div>
      )}

      <main className="container-responsive py-3 sm:py-8 px-4 sm:px-6">
        <div className="space-y-4 sm:space-y-8">
          {showViewOnly ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  Your Team
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => router.push(`/contests/${contestId}`)}
                  >
                    Back to Contest
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      router.push(`/contests/${contestId}/leaderboard`)
                    }
                  >
                    View Leaderboard
                  </Button>
                </div>
              </div>
              {loadingTeam ? (
                <div className="text-gray-500">Loading your team...</div>
              ) : existingTeam ? (
                <Card className="p-6 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Team Name</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {existingTeam.team_name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Total Points:{" "}
                      <span className="font-semibold text-success-700">
                        {Math.floor(existingTeam.total_points)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() =>
                        router.push(
                          `/teams?contest_id=${encodeURIComponent(String(contestId || ""))}`
                        )
                      }
                    >
                      View Details
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="text-gray-500">No team found.</div>
              )}
            </>
          ) : (
            <>
              {/* Progress */}
              <div className="max-w-3xl mx-auto mb-4 sm:mb-8 md:mb-10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 mr-2">
                    <ProgressIndicator
                      currentStep={currentStep === 1 ? 0 : currentStep - 1}
                      totalSteps={3}
                      className=""
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleClearAll}
                    className="flex-shrink-0 text-xs sm:text-sm px-2.5 sm:px-4"
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              {/* Step 1: Player Selection */}
              <StepCard
                stepNumber={1}
                title="Select Players"
                description=""
                isActive={currentStep === 1}
                isCompleted={currentStep > 1}
              >
                {isStep1Collapsed && currentStep > 1 ? (
                  <div
                    className="cursor-pointer hover:bg-gray-50 p-3 sm:p-4 rounded-lg transition-all duration-200"
                    onClick={() => {
                      setCurrentStep(1);
                      setIsStep1Collapsed(false);
                    }}
                  >
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        {slots.map((s) => {
                          const count = selectedCountBySlot[s.id] || 0;
                          const limit = SLOT_LIMITS[s.id] || 4;
                          return (
                            <Badge
                              key={s.id}
                              variant={count >= limit ? "success" : "secondary"}
                              size="sm"
                              className="justify-center"
                            >
                              {s.name}: {count}/{limit}
                            </Badge>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm sm:text-base text-gray-600">
                          <span className="font-semibold text-gray-900">
                            {selectedPlayers.length} players
                          </span>{" "}
                          selected
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary-600 hover:text-primary-700"
                        >
                          Edit Selection
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">
                        Players Selected: {selectedPlayers.length}/16
                      </h4>
                    </div>

                    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm">
                      Select 4 players in each Slot and press Next to proceed.
                    </div>

                    <div className="flex overflow-x-auto gap-2 mb-3 sm:mb-4 pb-2 -mx-2 px-2 scrollbar-hide">
                      {slots.map((s) => {
                        const limit = SLOT_LIMITS[s.id];
                        const count = selectedCountBySlot[s.id] || 0;
                        const isActive = activeSlotId === s.id;
                        return (
                          <Button
                            key={s.id}
                            variant={isActive ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => setActiveSlotId(s.id)}
                            className="rounded-full flex-shrink-0"
                          >
                            {s.name}
                            {limit !== undefined && (
                              <span
                                className={`ml-2 text-xs ${isActive ? "text-white/90" : "text-gray-600"}`}
                              >
                                {count || 0}/{limit}
                              </span>
                            )}
                          </Button>
                        );
                      })}
                    </div>

                    {loading ? (
                      <div className="text-center text-gray-500 py-6">
                        Loading players...
                      </div>
                    ) : error ? (
                      <div className="text-center text-red-600 py-6">
                        {error}
                      </div>
                    ) : (
                      <PlayerList
                        players={
                          players.filter(
                            (p) => p.slotId === activeSlotId
                          ) as unknown as Player[]
                        }
                        selectedPlayers={selectedPlayers}
                        onPlayerSelect={handlePlayerSelect}
                        maxSelections={16}
                        onBlockedSelect={(reason) => alert(reason)}
                        compact={true}
                        compactShowPrice={false}
                        isPlayerDisabled={(player) => {
                          if (selectedPlayers.includes(player.id)) {
                            return false;
                          }
                          const playerSlotId = (
                            players.find((p) => p.id === player.id) as any
                          )?.slotId as string | undefined;
                          if (!playerSlotId) return false;
                          const currentSlotCount = selectedPlayers.filter(
                            (id) => {
                              const p = players.find(
                                (mp) => mp.id === id
                              ) as any;
                              return p?.slotId === playerSlotId;
                            }
                          ).length;
                          const slotLimit = SLOT_LIMITS[playerSlotId] || 4;
                          return currentSlotCount >= slotLimit;
                        }}
                      />
                    )}

                    {slots.findIndex((s) => s.id === activeSlotId) ===
                    slots.length - 1 ? (
                      <div className="flex items-center justify-center mt-6">
                        <div className="flex gap-3 w-full sm:w-auto">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={goToPrevSlot}
                            disabled={isFirstSlot}
                            className="flex-1 sm:flex-none"
                          >
                            Previous
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setCurrentStep(2);
                              setIsStep1Collapsed(true);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            disabled={!canNextForActiveSlot}
                            className="flex-1 sm:flex-none"
                          >
                            Continue
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center mt-6">
                        <div className="flex gap-3 w-full sm:w-auto">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={goToPrevSlot}
                            disabled={isFirstSlot}
                            className="flex-1 sm:flex-none"
                          >
                            Previous
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={goToNextSlot}
                            disabled={!canNextForActiveSlot}
                            className="flex-1 sm:flex-none"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
                          {players
                            .filter((player) =>
                              selectedPlayers.includes(player.id)
                            )
                            .map((player: Player) => (
                              <PlayerCard
                                key={player.id}
                                player={player}
                                isSelected={true}
                                isCaptain={player.id === captainId}
                                isViceCaptain={player.id === viceCaptainId}
                                onSelect={() => {}}
                                onSetCaptain={handleSetCaptain}
                                onSetViceCaptain={handleSetViceCaptain}
                                onReplace={openReplace}
                                showActions={true}
                                variant="captain"
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
                        {/* Team Name Input */}
                        <div className="mb-6">
                          <label
                            htmlFor="teamName"
                            className="block text-sm font-medium text-gray-700 mb-2"
                          >
                            Team Name
                          </label>
                          <input
                            type="text"
                            id="teamName"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Enter your team name"
                            maxLength={50}
                          />
                        </div>

                        {/* Team Preview */}
                        <Card className="p-6">
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">
                            Your Dream Team
                          </h4>
                          <div className="space-y-3">
                            {players
                              .filter((player) =>
                                selectedPlayers.includes(player.id)
                              )
                              .map((player: Player) => (
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
                                        {player.team}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium text-success-600">
                                      {player.points} pts
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

              {/* Replace Modal */}
              {showReplace && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
                    <div className="flex items-center justify-between px-5 py-3 border-b">
                      <h3 className="font-semibold text-gray-900">
                        Replace Player
                      </h3>
                      <button
                        onClick={closeReplace}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-5 max-h-[70vh] overflow-y-auto space-y-3">
                      {(() => {
                        const target = players.find(
                          (p) => p.id === replaceTargetId
                        );
                        const slotId = target?.slotId;
                        const candidates = players.filter(
                          (p) =>
                            p.slotId === slotId &&
                            !selectedPlayers.includes(p.id)
                        );
                        if (!target)
                          return (
                            <div className="text-gray-500">
                              No player selected.
                            </div>
                          );
                        return (
                          <div className="space-y-2">
                            <div className="text-sm text-gray-600">
                              Replacing{" "}
                              <span className="font-medium text-gray-900">
                                {target.name}
                              </span>
                              . Choose a replacement from the same slot.
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {candidates.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => confirmReplace(p.id)}
                                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 text-left"
                                >
                                  <Avatar name={p.name} size="sm" />
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">
                                      {p.name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {p.team}
                                    </div>
                                  </div>
                                  <div className="text-right text-sm text-success-600">
                                    {Math.floor(p.points)} pts
                                  </div>
                                </button>
                              ))}
                              {candidates.length === 0 && (
                                <div className="text-sm text-gray-500">
                                  No available players in this slot.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="px-5 py-3 border-t flex justify-end">
                      <Button variant="ghost" onClick={closeReplace}>
                        Close
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Global Submit */}
              <div className="flex justify-center mt-6">
                <Button
                  variant="primary"
                  size="lg"
                  className="shadow-glow"
                  disabled={currentStep !== 3 || submitting}
                  onClick={handleSubmitTeam}
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
