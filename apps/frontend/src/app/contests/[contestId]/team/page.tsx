"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/utils";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { LS_KEYS, ROUTES } from "@/common/consts";
import {
  PlayerCard,
  PlayerList,
  StepCard,
  ProgressIndicator,
  Button,
  Badge,
  Card,
  Avatar,
  CaptainSelectionCard,
} from "@/components";
import type { Player } from "@/components";
import {
  createTeam,
  getUserTeams,
  getTeam,
  updateTeam,
  type TeamResponse,
} from "@/lib/api/teams";
import {
  publicContestsApi,
  type Contest,
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { useTeamBuilder } from "@/hooks/useTeamBuilder";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { LoadingScreen } from "./molecules/LoadingScreen";
import { EnrollmentBanner } from "./molecules/EnrollmentBanner";
import { TeamSummary } from "./molecules/TeamSummary";

export default function ContestTeamBuilderPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const contestId = Array.isArray((params as any)?.contestId)
    ? (params as any).contestId[0]
    : (params as any)?.contestId;

  // Enrolled contest (optional banner if already enrolled in this contest)
  const [enrolledHere, setEnrolledHere] = useState<boolean>(false);
  const [loadingEnrollment, setLoadingEnrollment] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentResponse | null>(null);

  // Existing team (enable edit mode when exists)
  const [existingTeam, setExistingTeam] = useState<TeamResponse | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Enrollment gating state
  const [hasCheckedEnrollment, setHasCheckedEnrollment] = useState(false);

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
    TOTAL_MAX,
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
  } = useTeamBuilder(typeof contestId === "string" ? contestId : undefined, {
    enabled: hasCheckedEnrollment && !(enrolledHere || !!existingTeam),
  });

  // Team submission states
  const [submitting, setSubmitting] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [showNameDialog, setShowNameDialog] = useState(false);
  // Reusable alert dialog
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState<string | undefined>(undefined);
  const showAlert = (message: string, title?: string) => {
    setAlertMessage(message);
    setAlertTitle(title);
    setAlertOpen(true);
  };

  // Selected contest is fixed from route
  const [selectedContestId, setSelectedContestId] = useState<string>("");

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
          ? mine.find(
              (x) => x.contest_id === contestId && x.status === "active"
            )
          : undefined;
        setEnrollment(e || null);
        const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
        let team: TeamResponse | null = null;
        if (e?.team_id && token) {
          try {
            setLoadingTeam(true);
            team = await getTeam(e.team_id, token);
          } catch {
            team = null;
          } finally {
            if (mounted) setLoadingTeam(false);
          }
        } else if (token) {
          // Fallback: find team for this contest from user's teams
          try {
            setLoadingTeam(true);
            const list = await getUserTeams(token);
            team = list.teams.find((t) => t.contest_id === contestId) || null;
          } finally {
            if (mounted) setLoadingTeam(false);
          }
        }
        if (mounted) {
          setExistingTeam(team);
          // Consider enrolled only if enrollment is active and a valid team exists
          setEnrolledHere(!!(e && team));
        }
      } catch {
        // ignore
      } finally {
        if (mounted) {
          setLoadingEnrollment(false);
          setHasCheckedEnrollment(true);
        }
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

  // Page-level loading: wait for all prerequisite requests to finish
  const pageLoading =
    !hasCheckedEnrollment ||
    loadingEnrollment ||
    (enrolledHere && loadingTeam) ||
    (hasCheckedEnrollment && !(enrolledHere || !!existingTeam) && loading);

  if (pageLoading) {
    return <LoadingScreen />;
  }

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
      setShowNameDialog(true);
      return;
    }
    if (!captainId) {
      showAlert("Please select a captain", "Validation");
      return;
    }
    if (!viceCaptainId) {
      showAlert("Please select a vice-captain", "Validation");
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
            showAlert(
              e?.response?.data?.detail ||
                e?.message ||
                "Failed to enroll in contest",
              "Enrollment failed"
            );
          }
        }
        gotoTeams();
      }
    } catch (err: any) {
      console.error("Failed to submit team:", err);
      showAlert(err.message || "Failed to submit team", "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // If a team exists show minimal view instead of builder
  const showViewOnly = !!existingTeam;

  // Prepare selected player objects for quick rendering in the Selected panel
  const selectedPlayerObjs = players.filter((p) =>
    selectedPlayers.includes(p.id)
  ) as unknown as Player[];

  return (
    <div className="min-h-screen bg-bg-body text-text-main">
      <AlertDialog
        open={alertOpen}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertOpen(false)}
      />

      {/* Team name required dialog */}
      {showNameDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowNameDialog(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-bg-elevated shadow-xl border border-border-subtle">
            <div className="p-5 sm:p-6">
              <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-brand text-white text-xs font-semibold shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
                Required
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-text-main">
                Please enter a team name
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                You need a name to create and enroll your team.
              </p>

              <div className="mt-4">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Golden Strikers"
                  className="w-full rounded-xl border border-border-subtle bg-bg-card px-4 py-2.5 text-text-main placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-accent-pink-soft/30 focus:border-accent-pink-soft"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNameDialog(false)}
                  className="px-4 py-2 rounded-full text-sm font-medium text-text-main hover:bg-bg-elevated border border-border-subtle"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (teamName.trim()) {
                      setShowNameDialog(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-brand shadow hover:shadow-pink-soft"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Enrolled banner */}
      {enrolledHere && <EnrollmentBanner />}

      {/* Fixed Selected Players Bar - Only show when not in view-only mode */}
      {!showViewOnly && (
        <div className="sticky top-20 z-40 px-2 sm:px-4 py-2 sm:py-4">
          <div className="max-w-6xl mx-auto">
            <div className="bg-bg-card/90 backdrop-blur-sm rounded-xl sm:rounded-2xl md:rounded-3xl shadow-lg border border-border-subtle p-2 sm:p-3 md:p-4">
              {/* Mobile: Horizontal layout */}
              <div className="sm:hidden">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h5 className="font-bold text-text-main text-sm">
                    Selected Players
                  </h5>
                  <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-brand text-white shadow-sm">
                    {selectedPlayers.length}/{TOTAL_MAX || 0}
                  </div>
                </div>
                <div>
                  {selectedPlayerObjs.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPlayerObjs.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => handlePlayerSelect(player.id)}
                          className="flex-shrink-0 px-1.5 py-0.5 border border-border-subtle rounded-full hover:bg-bg-elevated hover:border-accent-pink-soft transition-all duration-200 text-[9px] font-medium text-text-main whitespace-nowrap bg-bg-card shadow-sm"
                          title="Tap to remove"
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-500 italic">
                      No players selected yet
                    </p>
                  )}
                </div>
              </div>

              {/* Desktop: Vertical layout */}
              <div className="hidden sm:flex items-start gap-3 md:gap-4">
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <h5 className="font-bold text-text-main text-base md:text-lg">
                    Selected Players
                  </h5>
                  <div className="px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-brand text-white shadow-sm w-fit ml-8 md:ml-10">
                    {selectedPlayers.length}/{TOTAL_MAX || 0}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {selectedPlayerObjs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedPlayerObjs.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => handlePlayerSelect(player.id)}
                          className="flex-shrink-0 px-3 md:px-4 py-1.5 md:py-2 border-2 border-border-subtle rounded-full hover:bg-bg-elevated hover:border-accent-pink-soft transition-all duration-200 text-xs md:text-sm font-medium text-text-main whitespace-nowrap bg-bg-card shadow-sm"
                          title="Tap to remove"
                        >
                          {player.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs md:text-sm text-text-muted italic">
                      No players selected yet
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="container-responsive py-3 sm:py-8 px-4 sm:px-6">
        <div className="space-y-4 sm:space-y-8">
          {/* Removed TeamSummary - now showing builder directly */}
          {showViewOnly ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">
                You have already created a team for this contest.
              </p>
              <Button
                variant="primary"
                onClick={() =>
                  router.push(
                    `/teams?contest_id=${encodeURIComponent(String(contestId || ""))}`
                  )
                }
              >
                View Your Team
              </Button>
            </div>
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
                    className="cursor-pointer hover:bg-bg-elevated p-3 sm:p-4 rounded-lg transition-all duration-200"
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
                        <div className="text-sm sm:text-base text-text-muted">
                          <span className="font-semibold text-text-main">
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
                      <h4 className="font-semibold text-text-main text-sm sm:text-base">
                        Players Selected: {selectedPlayers.length}/
                        {TOTAL_MAX || 12}
                      </h4>
                    </div>
                    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-500/10 text-amber-500 px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm">
                      {(() => {
                        const mins = Array.from(
                          new Set(slots.map((s) => s.min_select))
                        );
                        if (mins.length === 1) {
                          return `Select ${mins[0]} players in each Slot and press Next to proceed.`;
                        }
                        return `Meet the minimum required players in each Slot and press Next to proceed.`;
                      })()}
                    </div>
                    {/* Player list - now full width */}{" "}
                    <div>
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
                                  className={`ml-2 text-xs ${isActive ? "text-white/90" : "text-text-muted"}`}
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
                          key={`slot-${activeSlotId}`}
                          players={
                            players.filter(
                              (p) => p.slotId === activeSlotId
                            ) as unknown as Player[]
                          }
                          selectedPlayers={selectedPlayers}
                          onPlayerSelect={handlePlayerSelect}
                          maxSelections={TOTAL_MAX || 0}
                          onBlockedSelect={(reason) =>
                            showAlert(reason, "Selection limit")
                          }
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
                                window.scrollTo({
                                  top: 0,
                                  behavior: "smooth",
                                });
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
                      {/* Removed Selected Players Panel - now at top as fixed bar */}
                    </div>
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
                        {(() => {
                          // Extract filtered players to avoid duplication
                          const selectedPlayersList = players.filter((player) =>
                            selectedPlayers.includes(player.id)
                          );

                          return (
                            <>
                              {/* Mobile: Compact Cards */}
                              <div className="md:hidden space-y-2">
                                {selectedPlayersList.map((player: Player) => (
                                  <CaptainSelectionCard
                                    key={player.id}
                                    player={player}
                                    isCaptain={player.id === captainId}
                                    isViceCaptain={player.id === viceCaptainId}
                                    onSetCaptain={handleSetCaptain}
                                    onSetViceCaptain={handleSetViceCaptain}
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
                                    onSetCaptain={handleSetCaptain}
                                    onSetViceCaptain={handleSetViceCaptain}
                                    onReplace={openReplace}
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
                            className="block text-sm font-medium text-text-main mb-2"
                          >
                            Team Name
                          </label>
                          <input
                            type="text"
                            id="teamName"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-border-subtle bg-bg-card text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-accent-pink-soft/40 focus:border-accent-pink-soft"
                            placeholder="Enter your full name"
                            maxLength={50}
                          />
                        </div>

                        {/* Team Preview */}
                        <Card className="p-6 bg-bg-card border border-border-subtle text-text-main">
                          <h4 className="text-lg font-semibold text-text-main mb-4">
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

              {/* Replace Modal */}
              {showReplace && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-bg-elevated rounded-xl shadow-xl w-full max-w-2xl border border-border-subtle">
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
                            <div className="text-text-muted">
                              No player selected.
                            </div>
                          );
                        return (
                          <div className="space-y-2">
                            <div className="text-sm text-text-muted">
                              Replacing{" "}
                              <span className="font-medium text-text-main">
                                {target.name}
                              </span>
                              . Choose a replacement from the same slot.
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {candidates.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => confirmReplace(p.id)}
                                  className="flex items-center gap-3 p-3 border rounded-lg border-border-subtle hover:bg-bg-elevated text-left"
                                >
                                  <Avatar name={p.name} size="sm" />
                                  <div className="flex-1">
                                    <div className="font-medium text-text-main">
                                      {p.name}
                                    </div>
                                    <div className="text-xs text-text-muted">
                                      {p.team}
                                    </div>
                                  </div>
                                  <div className="text-right text-sm text-success-600">
                                    {formatPoints(p.points || 0)} pts
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
