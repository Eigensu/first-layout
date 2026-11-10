# Technical Spec: Phase 2 - Mobile App Skeleton & UI Foundation

## **Objective**

Initialize the `apps/mobile` application using Expo (React Native), configure it to work within the existing pnpm monorepo, set up the styling system using NativeWind (sharing the theme from the frontend), and implement the base navigation architecture.

## **Context**

  * **Repository:** `world-tower` (Monorepo with pnpm + Turborepo).
  * **Target Directory:** `apps/mobile`.
  * **New Package:** `packages/ui-native` (Shared UI primitives).
  * **Tech Stack:** Expo SDK 52+, React Native, NativeWind (Tailwind), React Navigation.

-----

## **Execution Steps**

### **Step 1: Initialize Expo Application**

**Action:** Create the mobile app directory and configure package identity.

1.  **Create Project:**
    Run from repo root:
    ```bash
    cd apps
    npx create-expo-app@latest mobile -t expo-template-blank-typescript
    ```
2.  **Clean Up:** Remove the default git repository inside `apps/mobile` (if created) to respect the monorepo root git.
3.  **Update `apps/mobile/package.json`**:
      * Change name to `"@fantasy11/mobile"`.
      * Mark as `"private": true`.
      * Add workspace dependencies (created in Phase 1):
        ```json
        "dependencies": {
          "@fantasy11/types": "workspace:*",
          "@fantasy11/utils": "workspace:*",
          "@fantasy11/constants": "workspace:*",
          "@fantasy11/env-config": "workspace:*",
          "expo": "~52.0.0",
          "react": "18.3.1",
          "react-native": "0.76.0"
        }
        ```

### **Step 2: Monorepo & Metro Configuration (CRITICAL)**

**Action:** Configure the Metro bundler to "see" files outside the `apps/mobile` directory.

1.  **Install Metro Deps:**
    In `apps/mobile`:

    ```bash
    pnpm add -D expo-router react-native-reanimated
    ```

    *(Note: We install `expo-router` deps even if using React Navigation for better Metro integration defaults).*

2.  **Create `apps/mobile/metro.config.js`**:
    Paste this configuration to allow importing from `../../packages`:

    ```javascript
    const { getDefaultConfig } = require('expo/metro-config');
    const path = require('path');

    const projectRoot = __dirname;
    const workspaceRoot = path.resolve(projectRoot, '../..');

    const config = getDefaultConfig(projectRoot);

    // 1. Watch all files within the monorepo
    config.watchFolders = [workspaceRoot];

    // 2. Let Metro resolve modules from the project root and the workspace root
    config.resolver.nodeModulesPaths = [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ];

    // 3. Force Metro to resolve (sub)dependencies from the workspace root
    config.resolver.disableHierarchicalLookup = true;

    module.exports = config;
    ```

### **Step 3: Create `packages/ui-native`**

**Action:** Initialize a shared UI package for React Native components.

1.  **Create Directory:** `packages/ui-native`
2.  **Initialize `package.json`**:
    ```json
    {
      "name": "@fantasy11/ui-native",
      "version": "0.0.0",
      "main": "./src/index.ts",
      "types": "./src/index.ts",
      "dependencies": {
        "react": "*",
        "react-native": "*",
        "nativewind": "^4.0.1", 
        "tailwindcss": "^3.4.0",
        "clsx": "^2.0.0",
        "tailwind-merge": "^2.0.0"
      },
      "devDependencies": {
        "typescript": "^5.3.0"
      }
    }
    ```
    *Note: Adjust NativeWind version based on the latest compatible with Expo 52.*
3.  **Create `tsconfig.json`** (Standard React Native TS config).
4.  **Create `src/index.ts`** and `src/components/Button.tsx` (a simple placeholder button using Tailwind classes).

### **Step 4: Configure NativeWind (Tailwind)**

**Action:** Set up styling in `apps/mobile` and reuse the theme from `apps/frontend`.

1.  **Install Deps in `apps/mobile`**:
    ```bash
    pnpm add nativewind tailwindcss clsx tailwind-merge
    ```
2.  **Setup `tailwind.config.js` in `apps/mobile`**:
      * **Action:** Copy the `theme` object from `apps/frontend/tailwind.config.js`.
      * **Content Paths:** Ensure it scans both the mobile app and the shared UI package.
    <!-- end list -->
    ```javascript
    /** @type {import('tailwindcss').Config} */
    module.exports = {
      content: [
        "./App.{js,jsx,ts,tsx}",
        "./src/**/*.{js,jsx,ts,tsx}",
        "../../packages/ui-native/src/**/*.{js,jsx,ts,tsx}" // <--- CRITICAL
      ],
      presets: [require("nativewind/preset")],
      theme: {
        extend: {
          // ... COPY THEME FROM FRONTEND HERE (colors, borderRadius, etc.)
        },
      },
      plugins: [],
    }
    ```
3.  **Update `babel.config.js`**:
    Add `"nativewind/babel"` to the plugins array.
4.  **Create Global CSS**:
    Create `apps/mobile/global.css`:
    ```css
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
    ```
5.  **Import CSS**: Add `import "./global.css"` to the top of `apps/mobile/App.tsx`.

### **Step 5: Setup React Navigation**

**Action:** Implement the basic "Auth vs App" navigation logic.

1.  **Install Dependencies:**
    In `apps/mobile`:
    ```bash
    pnpm add @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-safe-area-context
    ```
2.  **Create Directory:** `apps/mobile/src/navigation`.
3.  **Create `AppNavigator.tsx`**:
      * Create a `RootStack` navigator.
      * Create a `AuthStack` (Login, Register).
      * Create a `TabNavigator` (Home, MyContests, Profile).
      * **Logic:** Use a temporary `isAuthenticated` boolean (hardcoded to `false` for now) to switch between `AuthStack` and `TabNavigator`.

### **Step 6: Integrate Shared Packages**

**Action:** Verify the setup by using a shared type and shared UI component in the App.

1.  **Update `apps/mobile/App.tsx`**:
      * Import `NavigationContainer` and `AppNavigator`.
      * Import a test type from `@fantasy11/types`.
      * Render the navigation structure.

-----

## **Acceptance Criteria**

1.  `apps/mobile` exists and `pnpm install` succeeds at the root.
2.  Running `pnpm --filter @fantasy11/mobile dev` starts the Metro bundler without errors.
3.  The app runs on a Simulator (iOS) or Emulator (Android).
4.  Tailwind classes work (e.g., `<View className="bg-red-500" />` renders red).
5.  The app displays the Navigation structure (e.g., a "Login" header or "Home" tab).
6.  `packages/ui-native` is linked correctly, and changes in that package reflect in the mobile app.

-----

## **Note to Agent**

> "When configuring `tailwind.config.js` in `apps/mobile`, strictly copy the `theme.extend.colors` and `theme.extend.borderRadius` sections from `apps/frontend/tailwind.config.js` to ensure the mobile app matches the web branding exactly. Do not overwrite the `content` array; use the specific paths defined in Step 4."