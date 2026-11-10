import { useState, useMemo } from 'react';
import { Player, Slot } from '../../../types/arena';

interface UseTeamBuilderProps {
    players: Player[];
    slots: Slot[];
}

export const useTeamBuilder = ({ players, slots }: UseTeamBuilderProps) => {
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
    const [captainId, setCaptainId] = useState<string | null>(null);
    const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);

    // Total squad size is whatever the slots actually require, not a fixed
    // assumption — it's the sum of each slot's max_select.
    const totalSquadSize = useMemo(
        () => slots.reduce((sum, slot) => sum + slot.max_select, 0),
        [slots]
    );

    // Calculate real-time stats
    const stats = useMemo(() => {
        const selectedPlayers = players.filter(p => selectedPlayerIds.has(p.id));

        // Count players per slot
        const slotCounts: Record<string, number> = {};
        selectedPlayers.forEach(p => {
            if (p.slot) {
                slotCounts[p.slot] = (slotCounts[p.slot] || 0) + 1;
            }
        });

        // Validate slot constraints
        const slotViolations: Array<{ slot: Slot; actual: number }> = [];
        slots.forEach(slot => {
            const count = slotCounts[slot.id] || 0;
            if (count < slot.min_select || count > slot.max_select) {
                slotViolations.push({ slot, actual: count });
            }
        });

        return {
            count: selectedPlayerIds.size,
            total: totalSquadSize,
            slotCounts,
            slotViolations,
            isValid: slotViolations.length === 0 &&
                selectedPlayerIds.size >= 1 &&
                selectedPlayerIds.size <= totalSquadSize,
        };
    }, [selectedPlayerIds, players, slots, totalSquadSize]);

    const togglePlayer = (player: Player) => {
        const newSet = new Set(selectedPlayerIds);

        if (newSet.has(player.id)) {
            // Remove player
            newSet.delete(player.id);
            if (captainId === player.id) setCaptainId(null);
            if (viceCaptainId === player.id) setViceCaptainId(null);
        } else {
            // Add player (check constraints)
            if (totalSquadSize > 0 && newSet.size >= totalSquadSize) {
                return { success: false, error: `Maximum ${totalSquadSize} players allowed` };
            }

            // Per-slot cap: the UI disables the remaining cards once a slot
            // is full, but enforce it here too so the rule can't be bypassed.
            const slot = slots.find(s => s.id === player.slot);
            if (slot && (stats.slotCounts[slot.id] || 0) >= slot.max_select) {
                return {
                    success: false,
                    error: `You can only pick ${slot.max_select} from ${slot.name}`,
                };
            }

            newSet.add(player.id);
        }

        setSelectedPlayerIds(newSet);
        return { success: true };
    };

    const setCaptain = (playerId: string) => {
        if (!selectedPlayerIds.has(playerId)) return;
        if (viceCaptainId === playerId) setViceCaptainId(null);
        setCaptainId(playerId);
    };

    const setViceCaptain = (playerId: string) => {
        if (!selectedPlayerIds.has(playerId)) return;
        if (captainId === playerId) return; // Can't be both
        setViceCaptainId(playerId);
    };

    // Clears every pick in one state update. Toggling players one by one
    // from a loop doesn't work: each toggle copies the same stale set, so
    // only the last removal survives (and setCaptain("") is a no-op).
    const resetSelection = () => {
        setSelectedPlayerIds(new Set());
        setCaptainId(null);
        setViceCaptainId(null);
    };

    const canSubmit = useMemo(() => {
        return stats.isValid && captainId && viceCaptainId && captainId !== viceCaptainId;
    }, [stats.isValid, captainId, viceCaptainId]);

    const replacePlayer = (oldPlayerId: string, newPlayerId: string) => {
        if (!selectedPlayerIds.has(oldPlayerId)) return { success: false, error: 'Player not in team' };
        if (selectedPlayerIds.has(newPlayerId)) return { success: false, error: 'Player already in team' };

        const newSet = new Set(selectedPlayerIds);
        newSet.delete(oldPlayerId);
        newSet.add(newPlayerId);

        // Transfer roles
        if (captainId === oldPlayerId) setCaptainId(newPlayerId);
        if (viceCaptainId === oldPlayerId) setViceCaptainId(newPlayerId);

        setSelectedPlayerIds(newSet);
        return { success: true };
    };

    return {
        selectedPlayerIds,
        captainId,
        viceCaptainId,
        stats,
        togglePlayer,
        replacePlayer,
        setCaptain,
        setViceCaptain,
        resetSelection,
        canSubmit,
    };
};
