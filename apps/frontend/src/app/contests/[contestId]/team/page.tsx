"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LS_KEYS, ROUTES } from "@/common/consts";
import { Button, ProgressIndicator, showToast } from "@/components";
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
  type EnrollmentResponse,
} from "@/lib/api/public/contests";
import { useTeamBuilder } from "@/hooks/useTeamBuilder";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { LoadingScreen } from "./molecules/LoadingScreen";
import { EnrollmentBanner } from "./molecules/EnrollmentBanner";
import { SelectedPlayersBar } from "./molecules/SelectedPlayersBar";
import { TeamNameDialog } from "./molecules/TeamNameDialog";
import { PlayerSelectionStep } from "./molecules/PlayerSelectionStep";
import { CaptainSelectionStep } from "./molecules/CaptainSelectionStep";
import { TeamSummaryStep } from "./molecules/TeamSummaryStep";
import { ReplacePlayerModal } from "./molecules/ReplacePlayerModal";

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
    // isLastSlot,

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
    showToast({
      message: "Player replaced successfully",
      variant: "success",
    });
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

      <TeamNameDialog
        open={showNameDialog}
        onClose={() => setShowNameDialog(false)}
        teamName={teamName}
        onTeamNameChange={setTeamName}
        onConfirm={() => setShowNameDialog(false)}
      />

      {/* Enrolled banner */}
      {enrolledHere && <EnrollmentBanner />}

      {/* Fixed Selected Players Bar - Only show when not in view-only mode */}
      {!showViewOnly && (
        <SelectedPlayersBar
          selectedPlayersCount={selectedPlayers.length}
          totalMax={TOTAL_MAX || 0}
          selectedPlayerObjs={selectedPlayerObjs}
          onPlayerRemove={handlePlayerSelect}
        />
      )}

      <main className="container-responsive py-2 sm:py-8 px-2 sm:px-6">
        <div className="space-y-4 sm:space-y-8">
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
              {/* Step 1: Player Selection */}
              <PlayerSelectionStep
                currentStep={currentStep}
                isStep1Collapsed={isStep1Collapsed}
                onExpand={() => {
                  setCurrentStep(1);
                  setIsStep1Collapsed(false);
                }}
                isCompleted={currentStep > 1}
                slots={slots}
                players={players}
                selectedPlayers={selectedPlayers}
                activeSlotId={activeSlotId}
                loading={loading}
                error={error}
                selectedCountBySlot={selectedCountBySlot}
                slotLimits={SLOT_LIMITS}
                totalMax={TOTAL_MAX || 12}
                onClearAll={handleClearAll}
                onSetActiveSlot={setActiveSlotId}
                onPlayerSelect={handlePlayerSelect}
                onBlockSelect={(reason) => showAlert(reason, "Selection limit")}
                onNextSlot={goToNextSlot}
                onPrevSlot={goToPrevSlot}
                onContinue={() => {
                  setCurrentStep(2);
                  setIsStep1Collapsed(true);
                  window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                  });
                }}
                isFirstSlot={isFirstSlot}
                canNextForActiveSlot={canNextForActiveSlot}
                isLastSlot={
                  slots.findIndex((s) => s.id === activeSlotId) ===
                  slots.length - 1
                } // Re-calc isLastSlot if not exported by hook, or pass it if hook provides it. Hook provided a lot, let's assume I need to calc or it was passed?
                // Wait, useTeamBuilder usually doesn't return isLastSlot. I'll check the hook usage in previous file content
                // Previous file content didn't show isLastSlot in destructuring on line 95... checking...
                // Line 636: slots.findIndex(...) === slots.length - 1.  It was calculated inline.
                // So I should calculate it here or in the component. I passed it as a prop.
                // I'll calculate it here.
              />

              {/* Step 2: Captain Selection */}
              <CaptainSelectionStep
                currentStep={currentStep}
                selectedPlayers={selectedPlayers}
                players={players}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                onSetCaptain={handleSetCaptain}
                onSetViceCaptain={handleSetViceCaptain}
                onReplace={openReplace}
                onFinalize={() => setCurrentStep(3)}
              />

              {/* Step 3: Team Summary */}
              <TeamSummaryStep
                currentStep={currentStep}
                selectedPlayers={selectedPlayers}
                players={players}
                teamName={teamName}
                onTeamNameChange={setTeamName}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                submitting={submitting}
                editMode={editMode}
                onSubmit={handleSubmitTeam}
              />

              {/* Replace Modal */}
              <ReplacePlayerModal
                open={showReplace}
                onClose={closeReplace}
                targetPlayerId={replaceTargetId}
                players={players}
                selectedPlayers={selectedPlayers}
                onConfirm={confirmReplace}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
