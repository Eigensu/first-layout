# Admin Players API Integration

## Summary

I've successfully integrated API functionality for the Players section of the admin dashboard. Here's what was implemented:

## Backend Changes

### 1. Created Admin Routes Structure
- **Location**: `/apps/backend/app/routes/admin/`
- Created `players.py` with full CRUD endpoints
- Created `__init__.py` to export the router

### 2. Admin Players API Endpoints
**Base URL**: `/api/admin/players`

#### GET `/api/admin/players`
- Fetch all players with pagination, search, and filters
- Query parameters:
  - `page`: Page number (default: 1)
  - `page_size`: Items per page (default: 10, max: 100)
  - `search`: Search by name or team
  - `role`: Filter by role (Batsman, Bowler, All-Rounder, Wicket-Keeper)
  - `status`: Filter by status (Active, Inactive, Injured)
  - `sort_by`: Sort field (default: created_at)
  - `sort_order`: Sort order (asc/desc)
- Returns: `PlayerListResponse` with players array, total count, page info
- Requires: Authentication (JWT token)

#### GET `/api/admin/players/{player_id}`
- Get a specific player by ID
- Returns: `PlayerResponse`
- Requires: Authentication

#### POST `/api/admin/players`
- Create a new player
- Body: `PlayerCreate` schema
- Returns: `PlayerResponse` (201 Created)
- Requires: Authentication

#### PUT `/api/admin/players/{player_id}`
- Update an existing player
- Body: `PlayerUpdate` schema (all fields optional)
- Returns: `PlayerResponse`
- Requires: Authentication

#### DELETE `/api/admin/players/{player_id}`
- Delete a player
- Returns: 204 No Content
- Requires: Authentication

### 3. Database Configuration
- Updated `config/database.py` to register the `Player` model with Beanie ODM
- Players collection is now initialized on startup

### 4. Main Application
- Updated `main.py` to include the admin players router

## Frontend Changes

### 1. API Client
**Location**: `/apps/frontend/src/lib/api/admin/players.ts`

Created TypeScript API client with:
- Type definitions: `Player`, `PlayerCreate`, `PlayerUpdate`, `PlayerListResponse`, `GetPlayersParams`
- Methods:
  - `getPlayers(params)`: Fetch paginated players with filters
  - `getPlayer(id)`: Get single player
  - `createPlayer(data)`: Create new player
  - `updatePlayer(id, data)`: Update player
  - `deletePlayer(id)`: Delete player
- Uses the existing `apiClient` with authentication interceptors

### 2. Admin Page Integration
**Location**: `/apps/frontend/src/app/admin/page.tsx`

Updated the `PlayersSection` component with:
- **State Management**:
  - Loading states
  - Error handling
  - Search query
  - Role and status filters
  - Pagination (page, pageSize, total)
  
- **Features**:
  - Real-time search (searches name and team)
  - Role filter dropdown (Batsman, Bowler, All-Rounder, Wicket-Keeper)
  - Status filter dropdown (Active, Inactive, Injured)
  - Loading spinner while fetching
  - Error messages with retry capability
  - Empty state message
  - Delete functionality with confirmation
  - Pagination controls (Previous, Next, page numbers)
  
- **UI Enhancements**:
  - Shows actual data from API
  - Displays price column
  - Color-coded status badges
  - Responsive pagination
  - Smooth loading transitions

## How to Test

### 1. Start Backend
```bash
cd apps/backend
python main.py
```

### 2. Start Frontend
```bash
cd apps/frontend
npm run dev
```

### 3. Access Admin Page
1. Navigate to `/admin` in your browser
2. Make sure you're logged in (JWT token required)
3. Click on the "Players" tab
4. You should see:
   - Real player data from MongoDB (or empty state if no data)
   - Working search functionality
   - Working filters
   - Pagination if you have more than 10 players

### 4. Create Sample Players
You can create players via the API or add a seed script. Example using curl:

```bash
curl -X POST http://localhost:8000/api/admin/players \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Virat Kohli",
    "team": "Royal Challengers Bangalore",
    "role": "Batsman",
    "points": 95.5,
    "status": "Active",
    "price": 12.0
  }'
```

## Authentication Note

All admin endpoints require authentication. Make sure:
1. User is logged in
2. JWT token is stored in localStorage
3. Token is valid and not expired

The frontend API client automatically:
- Adds the token to request headers
- Refreshes expired tokens
- Redirects to login if authentication fails

## Next Steps

To complete the admin dashboard, you can:
1. Add modal forms for creating/editing players
2. Implement the other sections (Sponsors, Contests, Slots)
3. Add role-based access control (only allow admins)
4. Add image upload for player avatars
5. Add bulk import/export functionality
6. Add advanced statistics and analytics

## File Structure

```
backend/
  app/
    routes/
      admin/
        __init__.py
        players.py          # ✅ NEW
    models/
      admin/
        player.py           # Already existed
    schemas/
      admin/
        player.py           # Already existed
  config/
    database.py             # ✅ UPDATED (added Player model)
  main.py                   # ✅ UPDATED (added admin router)

frontend/
  src/
    lib/
      api/
        admin/
          players.ts        # ✅ NEW
    app/
      admin/
        page.tsx            # ✅ UPDATED (API integration)
```
