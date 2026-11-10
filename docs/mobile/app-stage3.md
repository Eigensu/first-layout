This document outlines the technical specification for **Phase 3: Core Architecture & Navigation Skeleton**. This will serve as the blueprint for converting your current native build into a scalable application structure.

-----

# Technical Specification: Mobile Core Architecture

**Project:** Wall-E Arena (Mobile)
**Phase:** 3 - Core Architecture, Navigation, and State
**Date:** November 29, 2025

## 1\. Executive Summary

The objective of this phase is to implement a robust, scalable application skeleton using **Expo Router (v3/v4)**. We will establish a strict separation of concerns between "Screens" (Routing) and "Logic" (Source), implement a global Design System using **NativeWind v4**, and create a persistent Authentication State Machine using **Zustand** and **MMKV**.

-----

## 2\. Technology Stack & Dependencies

| Component | Library | Rationale |
| :--- | :--- | :--- |
| **Routing** | `expo-router` | File-based routing (Next.js style), native deep-linking support. |
| **Styling** | `nativewind` (v4) | Tailwind CSS for Native. Shares design tokens with Web. |
| **State** | `zustand` | Lightweight, boilerplate-free global state management. |
| **Storage** | `react-native-mmkv` | High-performance synchronous storage (30x faster than AsyncStorage). |
| **Fonts** | `expo-font` | Custom font loading (Inter/Geist) with Splash Screen control. |
| **Safe Area** | `react-native-safe-area-context` | Handling dynamic islands and notches automatically. |

-----

## 3\. Directory Structure (Monorepo Standard)

We will adopt a "Colocation" strategy where routes live in `app/` and business logic lives in `src/`.

```text
apps/mobile/
├── app/                        # ROUTING LAYER (UI Only)
│   ├── _layout.tsx             # Root Provider (Auth Listener, Theme, Fonts)
│   ├── +not-found.tsx          # 404 fallback
│   ├── (auth)/                 # ROUTE GROUP: Authentication
│   │   ├── _layout.tsx         # Stack Navigator (Headless)
│   │   ├── login.tsx           # Login Screen
│   │   └── signup.tsx          # Signup Screen
│   └── (tabs)/                 # ROUTE GROUP: Protected App
│       ├── _layout.tsx         # Bottom Tab Navigator
│       ├── index.tsx           # Home Feed
│       ├── wallet.tsx          # Wallet Screen
│       └── profile.tsx         # Settings/Profile
├── src/                        # LOGIC LAYER
│   ├── components/             # Reusable UI (Buttons, Inputs, Cards)
│   ├── core/                   # Global Config (AuthStore, API client)
│   ├── features/               # Complex feature logic
│   └── lib/                    # Utilities (MMKV instance, Date formatters)
├── global.css                  # NativeWind Global Styles
└── tailwind.config.js          # Shared Design System Config
```

-----

## 4\. Navigation Architecture

We will use **Route Groups**—folders with names wrapped in parentheses like `(auth)`—to decouple the authentication flow from the main application. This allows independent navigation histories.

### A. The Root Layout (`app/_layout.tsx`)

This is the "Brain" of the application. It has three responsibilities:

1.  **Hydrate State:** Check MMKV storage for an existing session token on launch.
2.  **Load Assets:** Keep the Splash Screen visible until Fonts and State are ready.
3.  **Protect Routes:** Redirect the user based on their status.

### B. The Redirect Logic

Instead of manually navigating, the Root Layout will reactively redirect:

  * **Condition:** `!isLoading && !user` → **Redirect to:** `/(auth)/login`
  * **Condition:** `!isLoading && user` → **Redirect to:** `/(tabs)`

-----

## 5\. Data Architecture (State Management)

We will use **Zustand** coupled with **MMKV** for persistence. This ensures that even if the user kills the app, they remain logged in upon reopening.

### Auth Store Specification (`src/core/authStore.ts`)

```typescript
type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
};

// Storage Adapter: Links Zustand to MMKV
const storage = new MMKV();
```

-----

## 6\. Implementation Plan

This is the exact sequence of execution.

### Step 1: Install Dependencies

Install the required packages. Note that `mmkv` requires a native rebuild (which you are now comfortable with).

```bash
# Core Navigation & UI
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar

# State & Storage
pnpm add zustand react-native-mmkv clsx tailwind-merge
```

### Step 2: Configure NativeWind (Tailwind)

Create `apps/mobile/tailwind.config.js`. We must ensure it scans both the `app` folder and the `src` folder.

```javascript
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: {} },
  plugins: [],
};
```

### Step 3: Create The Store

Implement `src/core/store/authStore.ts` with MMKV persistence logic.

### Step 4: Implement the Routes

1.  **Delete** the old `App.tsx` and `index.ts`.
2.  **Create** `app/_layout.tsx` (The Root).
3.  **Create** `app/(auth)/login.tsx` (The entry point).
4.  **Create** `app/(tabs)/_layout.tsx` (The main shell).

### Step 5: Native Rebuild (Final Step)

Because `react-native-mmkv` includes C++ code:

1.  `npx expo prebuild --platform ios --clean`
2.  `npx expo run:ios --device`

-----

## 7\. Next Actions

Would you like to proceed with **Step 1 (Installation)**, or would you like me to generate the code for **Step 3 (The Auth Store)** so you have the logic ready before we build the UI?