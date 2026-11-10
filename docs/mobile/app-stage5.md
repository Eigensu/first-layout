# Phase 5 Implementation Spec: The Arena (Gameplay Integration)

**Project:** Wall-E Arena Mobile App
**Phase:** 5 - Gameplay Integration
**Focus:** Connecting Frontend Gameplay UI to Existing Backend APIs
**Date:** November 29, 2025

-----

## 1\. Overview

This phase connects the "Skeleton" app to your existing backend. We are building the "Loop":

1.  **Select Match:** User picks a match from the Lobby.
2.  **Build Team:** User selects 11 players (Client-side validation).
3.  **Join Contest:** User submits the team to the backend API.
4.  **Track:** User watches the leaderboard update via polling.

-----

## 2\. API Contract & Types

We must define TypeScript interfaces that match your Backend DTOs.

**File:** `apps/mobile/src/types/arena.ts`

```typescript
// Adjust fields to match your actual Backend JSON response exactly
export interface Match {
  id: string;
  title: string;          // e.g., "IND vs AUS"
  teamA: { code: string; logoUrl: string };
  teamB: { code: string; logoUrl: string };
  startTime: string;      // ISO Date String
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
}

export interface Contest {
  id: string;
  entryFee: number;
  prizePool: number;
  totalSpots: number;
  filledSpots: number;
  maxTeamsPerUser: number;
}

export interface Player {
  id: string;
  name: string;
  role: 'WK' | 'BAT' | 'AR' | 'BOWL';
  teamCode: string;       // e.g., "IND"
  credits: number;
  points: number;         // Last match points or fantasy points
  imageUrl: string;
  isPlaying?: boolean;    // For "Announced" lineups
}

export interface LeaderboardEntry {
  rank: number;
  userName: string;
  points: number;
  teamName: string;
}
```

-----

## 3\. Service Layer (The Integration)

We use the `api` client created in Phase 4 to talk to your backend.

**File:** `apps/mobile/src/services/arenaService.ts`

```typescript
import { api } from '../lib/api-client';
import { Match, Contest, Player, LeaderboardEntry } from '../types/arena';

export const arenaService = {
  // 1. Get Matches (Lobby)
  getUpcomingMatches: async (): Promise<Match[]> => {
    const res = await api.get('/matches?status=UPCOMING');
    return res.data;
  },

  // 2. Get Contests for a specific match
  getContests: async (matchId: string): Promise<Contest[]> => {
    const res = await api.get(`/matches/${matchId}/contests`);
    return res.data;
  },

  // 3. Get Players (for Team Builder)
  getPlayers: async (matchId: string): Promise<Player[]> => {
    const res = await api.get(`/matches/${matchId}/players`);
    return res.data;
  },

  // 4. Submit Team (Join Contest)
  joinContest: async (contestId: string, playerIds: string[]) => {
    // Backend expects { team: ["p1", "p2"...] }
    return api.post(`/contests/${contestId}/join`, { players: playerIds });
  },

  // 5. Get Live Leaderboard
  getLeaderboard: async (contestId: string): Promise<LeaderboardEntry[]> => {
    const res = await api.get(`/contests/${contestId}/leaderboard`);
    return res.data;
  }
};
```

-----

## 4\. Feature Implementation Strategy

### 4.1. The Lobby (Infinite Scroll Feed)

We use `FlashList` to render matches efficiently.

  * **File:** `app/(tabs)/index.tsx`
  * **Data:** `useQuery(['matches', 'upcoming'], arenaService.getUpcomingMatches)`
  * **Component:** `<MatchCard />` (Clicking redirects to `/match/[id]`)

### 4.2. The Team Builder (Complex Logic)

This is the most critical part of the user experience. We need a custom hook to enforce rules *before* sending data to the backend.

**Logic Hook:** `apps/mobile/src/features/arena/hooks/useTeamBuilder.ts`

```typescript
import { useState, useMemo } from 'react';
import { Player } from '../../../types/arena';
import { toast } from 'sonner-native';

export const useTeamBuilder = (allPlayers: Player[]) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Real-time Stats Calculation
  const stats = useMemo(() => {
    let creditsUsed = 0;
    let teamACount = 0;
    let teamBCount = 0;
    let roleCounts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };

    selectedIds.forEach((id) => {
      const p = allPlayers.find((player) => player.id === id);
      if (p) {
        creditsUsed += p.credits;
        roleCounts[p.role]++;
        // Logic to count players per team would go here
      }
    });

    return { creditsUsed, roleCounts, count: selectedIds.size };
  }, [selectedIds, allPlayers]);

  const togglePlayer = (player: Player) => {
    if (selectedIds.has(player.id)) {
      // Remove Player
      const next = new Set(selectedIds);
      next.delete(player.id);
      setSelectedIds(next);
    } else {
      // Add Player (Validation)
      if (stats.count >= 11) return toast.error('Max 11 players allowed');
      if (stats.creditsUsed + player.credits > 100) return toast.error('Not enough credits');
      
      const next = new Set(selectedIds);
      next.add(player.id);
      setSelectedIds(next);
    }
  };

  return { selectedIds, stats, togglePlayer };
};
```

### 4.3. Live Leaderboard (Polling)

We do not need WebSockets yet. We will use **Short Polling** (fetching data every 10 seconds).

**Code Pattern:**

```typescript
useQuery({
  queryKey: ['leaderboard', contestId],
  queryFn: () => arenaService.getLeaderboard(contestId),
  refetchInterval: 10000, // <--- Refresh every 10 seconds automatically
});
```

-----

## 5\. Directory Structure for Phase 5

We are adding dynamic routes for Matches.

```text
apps/mobile/
├── app/
│   ├── (tabs)/index.tsx          # Lobby (Match List)
│   └── match/
│       ├── [id]/                 # Dynamic Route for Match ID
│       │   ├── _layout.tsx       # Stack (Tabs hidden)
│       │   ├── index.tsx         # Contest Listing
│       │   ├── create-team.tsx   # Team Builder UI
│       │   └── leaderboard.tsx   # Live Rank
├── src/
│   ├── features/arena/
│   │   ├── components/           # MatchCard, PlayerRow, FilterBar
│   │   └── hooks/                # useTeamBuilder.ts
│   ├── services/
│   │   └── arenaService.ts       # API Calls
└── src/types/arena.ts            # Type Definitions
```

-----

## 6\. Implementation Checklist

### Step 1: Install UI Dependencies

```bash
cd apps/mobile
npx expo install @shopify/flash-list date-fns clsx
```

### Step 2: Define Types & Service

Create `src/types/arena.ts` and `src/services/arenaService.ts` first. This ensures you know exactly what data you are working with.

### Step 3: Build the Lobby

Update `(tabs)/index.tsx` to fetch matches and render them using `FlashList`.

### Step 4: Build the Team Builder Logic

Create the `useTeamBuilder` hook. Do not build the UI yet—write the logic to handle the "100 Credits" and "11 Players" constraints.

### Step 5: Build the Team Builder UI

Create the screen at `app/match/[id]/create-team.tsx`. Use the hook to drive the UI state (e.g., disable buttons if credits are low).

-----

## 7\. Success Criteria

  * [ ] **Lobby:** Displays list of matches from backend.
  * [ ] **Validation:** Team Builder prevents selecting \>11 players.
  * [ ] **Validation:** Team Builder prevents exceeding 100 credits.
  * [ ] **Submission:** Clicking "Join" sends the correct array of Player IDs to the backend.
  * [ ] **Live:** Leaderboard updates automatically every 10 seconds.

**Ready to start? Begin by creating the `arena.ts` types file.**