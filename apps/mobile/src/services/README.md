# Tournament Services

This directory contains services for handling tournament-related API calls.

Every tournament is served by one backend (`EXPO_PUBLIC_API_BASE_URL`). Each
request names the selected tournament in the `X-Tournament-Slug` header, and
the backend uses that to decide whose contests, teams and players to serve. One
account works in every tournament, so switching tournaments keeps you signed in.

## Services Overview

### 1. `tournamentService.ts`
**Purpose**: Fetch the tournament list from the backend's `/api/tournaments`
**Usage**: Tournament selection screen

```typescript
import { tournamentService } from './tournamentService';

// Get all tournaments
const tournaments = await tournamentService.getTournaments();

// Get only live tournaments
const liveTournaments = await tournamentService.getLiveTournaments();

// Get a specific tournament (its id is the slug)
const tournament = await tournamentService.getTournament('lpcl');
```

### 2. `selectedTournamentApiService.ts`
**Purpose**: Make API calls on behalf of the selected tournament
**Usage**: After user selects a tournament, use this for all tournament-specific API calls

```typescript
import { selectedTournamentApiService } from './selectedTournamentApiService';

// Check if tournament is selected
if (!selectedTournamentApiService.isTournamentSelected()) {
    // Redirect to tournament selection
    return;
}

// These carry the selected tournament's slug in X-Tournament-Slug
const players = await selectedTournamentApiService.get('/api/players');
const contests = await selectedTournamentApiService.get('/api/contests');
const userProfile = await selectedTournamentApiService.get('/api/users/me');

// POST request
const newTeam = await selectedTournamentApiService.post('/api/teams', teamData);
```

`lib/api-client.ts` (used by the arena services) and `authService.ts` add the
same header, so sign-ins also record which tournament the player joined from.

## App Flow

1. **App starts** → `useTournamentBootstrap` fetches the tournament list and
   makes sure one is always selected
2. **User selects tournament** → Tournament stored in `useTournamentStore`;
   cached queries are cleared so screens refetch for the new tournament
3. **All subsequent API calls** → Go to the same backend, naming the selected
   tournament in `X-Tournament-Slug`

## Adding a tournament

Nothing to change in the app: create the tournament on the backend and it
appears in `/api/tournaments`.
