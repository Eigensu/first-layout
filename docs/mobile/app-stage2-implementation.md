# Stage 2 Implementation Spec: Mobile App Skeleton & UI Foundation

## Overview
This document provides a step-by-step implementation guide for Phase 2 of the mobile app development plan. We'll initialize the Expo mobile app, configure it to work within the pnpm monorepo, set up NativeWind for styling (sharing the theme from the web app), create a shared UI package, and implement the base navigation architecture.

## Current State Analysis

### Existing Structure (After Stage 1)
```
walle-arena/
├── apps/
│   ├── frontend/          # Next.js web app
│   └── backend/           # Python FastAPI backend
├── packages/
│   ├── types/             # ✅ Shared TypeScript types
│   ├── utils/             # ✅ Shared business logic
│   ├── constants/         # ✅ Shared constants
│   └── env-config/        # ✅ Environment configuration
```

### What Needs to be Created
- `apps/mobile` - Expo React Native mobile app
- `packages/ui-native` - Shared React Native UI components
- Metro bundler configuration for monorepo support
- NativeWind (Tailwind) styling setup
- React Navigation architecture

---

## Prerequisites

Before starting, ensure you have:
- Node.js 22.18.0 (as specified in package.json)
- pnpm 10.18.3
- Expo CLI (will be installed via npx)
- iOS Simulator (Mac) or Android Emulator
- Xcode (Mac) or Android Studio

---

## Implementation Steps

### Step 1: Initialize Expo Application

#### 1.1 Create the Mobile App
```bash
cd walle-arena/apps
npx create-expo-app@latest mobile -t expo-template-blank-typescript
```

**What this does:**
- Creates a new Expo app with TypeScript template
- Installs Expo SDK 52+ (latest stable)
- Sets up basic React Native project structure

#### 1.2 Clean Up Git Repository
```bash
cd mobile
rm -rf .git
cd ../..
```

**Why:** The monorepo root already has git, we don't need a nested repository.

#### 1.3 Update `apps/mobile/package.json`

Replace the generated package.json with:
```json
{
  "name": "@walle/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "dev": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "build": "echo 'Mobile app built successfully'",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf .expo node_modules"
  },
  "dependencies": {
    "@walle/types": "workspace:*",
    "@walle/utils": "workspace:*",
    "@walle/constants": "workspace:*",
    "@walle/env-config": "workspace:*",
    "expo": "~52.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.0",
    "typescript": "^5.6.3"
  },
  "engines": {
    "node": "22.18.0"
  }
}
```

**Key changes:**
- Name changed to `@walle/mobile`
- **CRITICAL:** `"main": "node_modules/expo/AppEntry.js"` - Uses standard Expo entry point that loads `App.tsx` (NOT Expo Router's file-based routing)
- Added workspace dependencies from Stage 1
- Added build, lint, and type-check scripts for Turbo compatibility

**Why this matters:** The default `expo-router/entry` would look for an `app/` directory with file-based routing, but we're using React Navigation with a traditional `App.tsx` entry point and `src/` folder structure.

---

### Step 2: Configure Metro Bundler for Monorepo (CRITICAL)

This is the most important step. Without proper Metro configuration, the mobile app won't be able to import from workspace packages.

#### 2.1 Install Required Dependencies
```bash
cd walle-arena/apps/mobile
pnpm add react-native-reanimated react-native-safe-area-context
```

**Note:** These are core dependencies needed for React Navigation and smooth animations.

#### 2.2 Create `apps/mobile/metro.config.js`

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
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

// 4. Wrap with NativeWind v4 to process CSS
module.exports = withNativeWind(config, {
  input: './global.css',
});
```

**What this does:**
- `watchFolders`: Tells Metro to watch the entire monorepo for changes
- `nodeModulesPaths`: Allows Metro to find packages in both local and root node_modules
- `disableHierarchicalLookup`: Prevents Metro from looking up the directory tree (important for monorepos)
- `withNativeWind`: **CRITICAL for NativeWind v4** - Wraps the Metro config to process the CSS file and enable Tailwind compilation

---

### Step 3: Create `packages/ui-native` Package

#### 3.1 Create Directory Structure
```bash
cd walle-arena
mkdir -p packages/ui-native/src/components
```

#### 3.2 Create `packages/ui-native/package.json`
```json
{
  "name": "@walle/ui-native",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint src/**/*.{ts,tsx}",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist .turbo node_modules"
  },
  "dependencies": {
    "@walle/types": "workspace:*",
    "clsx": "^2.0.0",
    "nativewind": "^4.0.1",
    "tailwind-merge": "^2.0.0"
  },
  "peerDependencies": {
    "react": "*",
    "react-native": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "~18.3.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "8.57.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.3"
  }
}
```

**Note:** We use `peerDependencies` for react and react-native to avoid version conflicts.

#### 3.3 Create `packages/ui-native/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "jsx": "react-native",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

#### 3.4 Create ESLint Config `packages/ui-native/.eslintrc.js`
```javascript
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
  ],
  env: {
    "react-native/react-native": true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "react/react-in-jsx-scope": "off",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};
```


#### 3.5 Create Utility Functions `packages/ui-native/src/utils/cn.ts`
```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind classes
 * Combines clsx and tailwind-merge for optimal class handling
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

#### 3.6 Create Placeholder Button Component `packages/ui-native/src/components/Button.tsx`
```typescript
import React from "react";
import { Text, TouchableOpacity, TouchableOpacityProps } from "react-native";
import { cn } from "../utils/cn";

interface ButtonProps extends TouchableOpacityProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  ...props
}: ButtonProps) {
  const baseStyles = "rounded-xl items-center justify-center";
  
  const variantStyles = {
    primary: "bg-primary-500 active:bg-primary-600",
    secondary: "bg-secondary-500 active:bg-secondary-600",
    outline: "border-2 border-primary-500 bg-transparent",
  };
  
  const sizeStyles = {
    sm: "px-4 py-2",
    md: "px-6 py-3",
    lg: "px-8 py-4",
  };
  
  const textStyles = {
    primary: "text-white font-semibold",
    secondary: "text-white font-semibold",
    outline: "text-primary-500 font-semibold",
  };

  return (
    <TouchableOpacity
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      <Text className={textStyles[variant]}>{children}</Text>
    </TouchableOpacity>
  );
}
```

#### 3.7 Create Entry Point `packages/ui-native/src/index.ts`
```typescript
// Export components
export { Button } from "./components/Button";

// Export utilities
export { cn } from "./utils/cn";
```

---

### Step 4: Configure NativeWind (Tailwind CSS for React Native)

#### 4.1 Install Dependencies in Mobile App
```bash
cd walle-arena/apps/mobile
pnpm add nativewind tailwindcss clsx tailwind-merge react-native-css-interop
pnpm add -D @types/react-native
```

**Note:** `react-native-css-interop` is required for NativeWind v4 to work correctly with the babel plugin.

#### 4.2 Add `@walle/ui-native` Dependency to Mobile App

Update `apps/mobile/package.json` dependencies section:
```json
"dependencies": {
  "@walle/types": "workspace:*",
  "@walle/utils": "workspace:*",
  "@walle/constants": "workspace:*",
  "@walle/env-config": "workspace:*",
  "@walle/ui-native": "workspace:*",
  // ... rest of dependencies
}
```

#### 4.3 Create `apps/mobile/tailwind.config.js`

**CRITICAL:** Copy the theme from frontend to ensure consistent branding.

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "../../packages/ui-native/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Wall-E Arena Color Palette - Golden Beige Theme (Logo-Inspired)
        primary: {
          50: "#fdfcfa",
          100: "#f9f7f3",
          200: "#f0ebe0",
          300: "#e6ddca",
          400: "#d9cba3",
          500: "#bfab79",
          600: "#a89363",
          700: "#8c7853",
          800: "#6b5d3f",
          900: "#4a4029",
        },
        accent: {
          50: "#faf8f5",
          100: "#f3efe8",
          200: "#e6ddd0",
          300: "#d4c4ad",
          400: "#bfab8a",
          500: "#8c7853",
          600: "#756343",
          700: "#5e4e36",
          800: "#483a29",
          900: "#32281d",
        },
        text: {
          primary: "#2f2f2f",
          secondary: "#5a5a5a",
          tertiary: "#8a8a8a",
        },
        secondary: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        success: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
        },
        warning: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
          800: "#92400E",
          900: "#78350F",
        },
        error: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B",
          900: "#7F1D1D",
        },
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
    },
  },
  plugins: [],
};
```


#### 4.4 Update `apps/mobile/babel.config.js`

Add NativeWind plugin:
```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }]
    ],
    plugins: [
      "nativewind/babel",
      "react-native-reanimated/plugin",
    ],
  };
};
```

**Important:** `react-native-reanimated/plugin` must be listed last.

#### 4.5 Create `apps/mobile/global.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 4.6 Create TypeScript Declaration `apps/mobile/nativewind-env.d.ts`

Create this file in the root of `apps/mobile/`:

```typescript
/// <reference types="nativewind/types" />
```

**Important:** This file must be in `apps/mobile/nativewind-env.d.ts` (not in a subdirectory) so that TypeScript can pick it up based on the `tsconfig.json` include pattern.

---

### Step 5: Setup React Navigation

#### 5.1 Install Navigation Dependencies
```bash
cd walle-arena/apps/mobile
pnpm add @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
pnpm add react-native-screens react-native-safe-area-context
```

#### 5.2 Create Navigation Directory Structure
```bash
mkdir -p src/navigation src/screens/auth src/screens/app
```

#### 5.3 Create Auth Screens

**`src/screens/auth/LoginScreen.tsx`:**
```typescript
import React from "react";
import { View, Text } from "react-native";
import { Button } from "@walle/ui-native";

export function LoginScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-100 px-6">
      <Text className="text-3xl font-bold text-text-primary mb-8">
        Welcome to Wall-E Arena
      </Text>
      <Button variant="primary" size="lg" className="w-full mb-4">
        Login
      </Button>
      <Button variant="outline" size="lg" className="w-full">
        Register
      </Button>
    </View>
  );
}
```

**`src/screens/auth/RegisterScreen.tsx`:**
```typescript
import React from "react";
import { View, Text } from "react-native";
import { Button } from "@walle/ui-native";

export function RegisterScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-100 px-6">
      <Text className="text-3xl font-bold text-text-primary mb-8">
        Create Account
      </Text>
      <Button variant="primary" size="lg" className="w-full">
        Sign Up
      </Button>
    </View>
  );
}
```

#### 5.4 Create App Screens

**`src/screens/app/HomeScreen.tsx`:**
```typescript
import React from "react";
import { View, Text } from "react-native";

export function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-100">
      <Text className="text-2xl font-bold text-text-primary">
        Home Screen
      </Text>
    </View>
  );
}
```

**`src/screens/app/ContestsScreen.tsx`:**
```typescript
import React from "react";
import { View, Text } from "react-native";

export function ContestsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-100">
      <Text className="text-2xl font-bold text-text-primary">
        My Contests
      </Text>
    </View>
  );
}
```

**`src/screens/app/ProfileScreen.tsx`:**
```typescript
import React from "react";
import { View, Text } from "react-native";

export function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-primary-100">
      <Text className="text-2xl font-bold text-text-primary">
        Profile
      </Text>
    </View>
  );
}
```


#### 5.5 Create Navigation Structure

**`src/navigation/TabNavigator.tsx`:**
```typescript
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/app/HomeScreen";
import { ContestsScreen } from "../screens/app/ContestsScreen";
import { ProfileScreen } from "../screens/app/ProfileScreen";

const Tab = createBottomTabNavigator();

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: "#bfab79",
        tabBarInactiveTintColor: "#8a8a8a",
        tabBarStyle: {
          backgroundColor: "#f9f7f3",
        },
        headerStyle: {
          backgroundColor: "#bfab79",
        },
        headerTintColor: "#fff",
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Contests" component={ContestsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
```

**`src/navigation/AuthNavigator.tsx`:**
```typescript
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#bfab79",
        },
        headerTintColor: "#fff",
        headerTitleStyle: {
          fontWeight: "bold",
        },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
```

**`src/navigation/AppNavigator.tsx`:**
```typescript
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { AuthNavigator } from "./AuthNavigator";
import { TabNavigator } from "./TabNavigator";

export function AppNavigator() {
  // TODO: Replace with actual auth state from context
  const isAuthenticated = false;

  return (
    <NavigationContainer>
      {isAuthenticated ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
```

---

### Step 6: Update Main App Entry Point

#### 6.1 Update `apps/mobile/App.tsx`

Replace the entire file with:
```typescript
import "./global.css";
import { StatusBar } from "expo-status-bar";
import { AppNavigator } from "./src/navigation/AppNavigator";
import type { User } from "@walle/types";

export default function App() {
  // Test import from shared package
  const testUser: User | null = null;
  
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
```

**What this does:**
- Imports global CSS for NativeWind
- Sets up navigation
- Tests import from `@walle/types` to verify workspace packages work

#### 6.2 Create `apps/mobile/tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@walle/*": ["../../packages/*/src"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ]
}
```

**Verification:** Ensure `nativewind-env.d.ts` exists at `apps/mobile/nativewind-env.d.ts` so the include pattern `"nativewind-env.d.ts"` can find it.

---

### Step 7: Install Dependencies and Verify Setup

#### 7.1 Install All Dependencies
```bash
cd walle-arena
pnpm install
```

#### 7.2 Type Check Mobile App
```bash
pnpm --filter @walle/mobile type-check
```

#### 7.3 Type Check UI Native Package
```bash
pnpm --filter @walle/ui-native type-check
```

#### 7.4 Build All Packages
```bash
pnpm run build
```

#### 7.5 Start Metro Bundler
```bash
pnpm --filter @walle/mobile dev
```

#### 7.6 Run on iOS Simulator (Mac only)
In a new terminal:
```bash
pnpm --filter @walle/mobile ios
```

#### 7.7 Run on Android Emulator
In a new terminal:
```bash
pnpm --filter @walle/mobile android
```

---

## Acceptance Criteria Checklist

- [ ] `apps/mobile` directory exists with Expo app structure
- [ ] `packages/ui-native` directory exists with Button component
- [ ] `apps/mobile/package.json` has `@walle/mobile` name and workspace dependencies
- [ ] `apps/mobile/metro.config.js` is configured for monorepo
- [ ] `apps/mobile/tailwind.config.js` has theme copied from frontend
- [ ] `apps/mobile/babel.config.js` includes NativeWind plugin
- [ ] `pnpm install` runs without errors at root
- [ ] `pnpm --filter @walle/mobile type-check` passes
- [ ] `pnpm --filter @walle/ui-native type-check` passes
- [ ] `pnpm run build` succeeds for all packages
- [ ] Metro bundler starts without errors
- [ ] App runs on iOS Simulator or Android Emulator
- [ ] Tailwind classes render correctly (golden beige theme visible)
- [ ] Navigation shows Login screen by default
- [ ] Button component from `@walle/ui-native` works
- [ ] Import from `@walle/types` works without errors

---

## Troubleshooting

### Issue: Metro bundler can't find workspace packages
**Solution:** 
1. Verify `metro.config.js` is configured correctly
2. Clear Metro cache: `pnpm --filter @walle/mobile start --clear`
3. Delete `node_modules` and reinstall: `rm -rf node_modules && pnpm install`

### Issue: NativeWind classes not applying
**Solution:**
1. Verify `babel.config.js` includes `nativewind/babel` plugin
2. Verify `global.css` is imported in `App.tsx`
3. Restart Metro bundler completely
4. Check `tailwind.config.js` content paths include your files

### Issue: TypeScript errors with workspace packages
**Solution:**
1. Verify `tsconfig.json` has correct paths configuration
2. Run `pnpm install` to ensure workspace links are created
3. Restart TypeScript server in your IDE

### Issue: "Unable to resolve module" errors
**Solution:**
1. Check that the package is listed in `package.json` dependencies
2. Verify the package exists in `packages/` directory
3. Run `pnpm install` from root
4. Clear Metro cache and restart

### Issue: iOS build fails
**Solution:**
1. Run `cd ios && pod install` (if ios folder exists)
2. Clean build folder in Xcode
3. Ensure Xcode Command Line Tools are installed

### Issue: Android build fails
**Solution:**
1. Verify Android Studio and SDK are properly installed
2. Check `ANDROID_HOME` environment variable is set
3. Run `./gradlew clean` in android folder (if exists)

---

## Important Notes

### Repository Naming
The spec references `walle-arena` as the root directory, which matches your current repository structure. All paths are relative to this root.

### Package Naming Convention
All packages use the `@walle/*` scope:
- `@walle/mobile` - Mobile app
- `@walle/ui-native` - Native UI components
- `@walle/types` - Shared types (from Stage 1)
- `@walle/utils` - Shared utilities (from Stage 1)
- `@walle/constants` - Shared constants (from Stage 1)
- `@walle/env-config` - Environment config (from Stage 1)

### Theme Consistency
The mobile app uses the exact same color palette as the web app to ensure brand consistency across platforms. The golden beige theme (#bfab79) is the primary brand color.

### Metro Bundler
Metro is React Native's JavaScript bundler. The configuration in `metro.config.js` is critical for monorepo support. Without it, Metro won't be able to resolve imports from workspace packages.

### NativeWind
NativeWind allows you to use Tailwind CSS classes in React Native. It compiles at build time, so there's no runtime performance penalty.

---

## Estimated Time
- Step 1 (Initialize Expo): 10 minutes
- Step 2 (Metro config): 5 minutes
- Step 3 (UI Native package): 20 minutes
- Step 4 (NativeWind setup): 15 minutes
- Step 5 (React Navigation): 30 minutes
- Step 6 (App entry point): 10 minutes
- Step 7 (Testing & validation): 20 minutes

**Total: ~2 hours**

---

## Success Metrics
✅ Mobile app runs on simulator/emulator
✅ Tailwind classes work correctly
✅ Navigation structure is functional
✅ Workspace packages import successfully
✅ Type checking passes for all packages
✅ Shared UI components render correctly
✅ Theme matches web app branding

---

## Next Steps (Phase 3 Preview)

After completing Stage 2, you'll be ready for:
1. Implement authentication flow in mobile app
2. Create shared API client package (`@walle/api-client`)
3. Build out contest and team management screens
4. Add state management (Context API or Zustand)
5. Implement real-time features
6. Add push notifications

---

## File Structure After Stage 2

```
walle-arena/
├── apps/
│   ├── frontend/              # Next.js web app
│   ├── backend/               # Python FastAPI backend
│   └── mobile/                # ✅ Expo mobile app
│       ├── src/
│       │   ├── navigation/
│       │   │   ├── AppNavigator.tsx
│       │   │   ├── AuthNavigator.tsx
│       │   │   └── TabNavigator.tsx
│       │   └── screens/
│       │       ├── auth/
│       │       │   ├── LoginScreen.tsx
│       │       │   └── RegisterScreen.tsx
│       │       └── app/
│       │           ├── HomeScreen.tsx
│       │           ├── ContestsScreen.tsx
│       │           └── ProfileScreen.tsx
│       ├── App.tsx
│       ├── global.css
│       ├── metro.config.js
│       ├── tailwind.config.js
│       ├── babel.config.js
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── types/                 # Shared TypeScript types
│   ├── utils/                 # Shared business logic
│   ├── constants/             # Shared constants
│   ├── env-config/            # Environment configuration
│   └── ui-native/             # ✅ Shared React Native UI
│       ├── src/
│       │   ├── components/
│       │   │   └── Button.tsx
│       │   ├── utils/
│       │   │   └── cn.ts
│       │   └── index.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── .eslintrc.js
└── package.json
```
