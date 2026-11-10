# Phase 4 Implementation Spec: Data Integration & Advanced Features
**Project:** Wall-E Arena Mobile App  
**Phase:** 4 - Networking, Data Sync, Notifications, & Feedback  
**Date:** November 29, 2025  
**Status:** Ready for Implementation  

---

## 1. Overview

This spec provides a step-by-step implementation guide for Phase 4, transforming the Wall-E Arena mobile app from a static UI to a dynamic, data-driven application with robust networking, error handling, and user feedback systems.

### Current State Analysis
- ✅ Auth store using Zustand with AsyncStorage persistence
- ✅ Basic routing with Expo Router
- ✅ Storage abstraction layer (AsyncStorage-based)
- ✅ Token stored in Zustand state (accessible synchronously after hydration)

### Key Changes Required
1. Add TanStack Query for server state management
2. Implement Axios with interceptors for API calls (reading token from Zustand store)
3. Add global error handling and toast notifications
4. Integrate Expo Notifications

---

## 2. Implementation Phases

### Phase 4.1: Networking Infrastructure
**Estimated Time:** 45 mins  
**Priority:** Critical (Foundation for all other phases)

#### Step 1.1: Install Dependencies

```bash
cd apps/mobile
pnpm add @tanstack/react-query axios zod sonner-native
```

**Dependencies Breakdown:**
- `@tanstack/react-query` - Server state management with caching
- `axios` - HTTP client with interceptors
- `zod` - Runtime schema validation
- `sonner-native` - Toast notifications

#### Step 1.2: Create API Client

**File:** `apps/mobile/src/lib/api-client.ts` (NEW)

**🔴 CRITICAL:** The token must be read from Zustand store state, NOT from raw storage. Zustand persist stores a JSON object like `{"state":{"token":"...","isAuthenticated":true},"version":0}`, so reading raw storage would require JSON parsing. Instead, access the hydrated store directly.

**🛡️ SAFETY:** The interceptor waits for hydration to complete before reading the token. This prevents a race condition on slow devices where an API call might fire before AsyncStorage finishes loading the persisted state.

```typescript
import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../core/store/authStore';

// Environment configuration
// TODO: Move to environment variables
const BASE_URL = __DEV__ 
  ? 'http://localhost:8000/api/v1' 
  : 'https://api.walle-arena.com/v1';

// Create axios instance
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject Auth Token
// ✅ CORRECT: Read from Zustand store state (hydrated synchronously on app launch)
// 🛡️ SAFETY: Wait for hydration to complete (prevents race condition on slow devices)
api.interceptors.request.use(
  async (config) => {
    // Ensure Zustand has finished hydrating from AsyncStorage
    const isHydrated = useAuthStore.persist.hasHydrated();
    if (!isHydrated) {
      await new Promise<void>((resolve) => {
        const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
          unsubscribe();
          resolve();
        });
      });
    }

    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle Global Errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle 401 Unauthorized - Token expired or invalid
    if (error.response?.status === 401) {
      const authStore = useAuthStore.getState();
      authStore.logout();
      // Navigation will be handled by _layout.tsx auth guard
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// Type-safe API error handler
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export const handleApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.message || error.message,
      status: error.response?.status,
      code: error.code,
    };
  }
  return {
    message: 'An unexpected error occurred',
  };
};
```

#### Step 1.3: Configure Query Provider

**File:** `apps/mobile/app/_layout.tsx`

**Action:** Wrap app with QueryClientProvider and add Toaster

```typescript
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner-native';
import { useAuthStore } from '../src/core/store/authStore';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <Toaster position="top-center" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

---

### Phase 4.2: User Profile & Wallet Services
**Estimated Time:** 45 mins  
**Priority:** High

#### Step 2.1: Define Type Schemas

**File:** `apps/mobile/src/types/user.ts` (NEW)

```typescript
import { z } from 'zod';

// Zod schemas for runtime validation
export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.string().datetime().optional(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(['credit', 'debit']),
  description: z.string(),
  date: z.string().datetime(),
});

export const WalletBalanceSchema = z.object({
  currency: z.string(),
  amount: z.number(),
  transactions: z.array(TransactionSchema),
});

// TypeScript types derived from schemas
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;
```

#### Step 2.2: Create User Service

**File:** `apps/mobile/src/services/userService.ts` (NEW)

```typescript
import { api } from '../lib/api-client';
import { UserProfile, WalletBalance, UserProfileSchema, WalletBalanceSchema } from '../types/user';

export const userService = {
  /**
   * Fetch current user profile
   */
  getProfile: async (): Promise<UserProfile> => {
    // TODO: Replace with actual API call when backend is ready
    // const response = await api.get<UserProfile>('/me');
    // return UserProfileSchema.parse(response.data);

    // MOCK DATA for development
    return new Promise<UserProfile>((resolve) =>
      setTimeout(() => {
        const mockData = {
          id: '123',
          email: 'user@walle.com',
          name: 'Wall-E Pilot',
          avatarUrl: 'https://i.pravatar.cc/150?img=3',
          createdAt: new Date().toISOString(),
        };
        resolve(UserProfileSchema.parse(mockData));
      }, 1000)
    );
  },

  /**
   * Fetch user wallet balance and transactions
   */
  getWallet: async (): Promise<WalletBalance> => {
    // TODO: Replace with actual API call
    // const response = await api.get<WalletBalance>('/wallet');
    // return WalletBalanceSchema.parse(response.data);

    // MOCK DATA
    return new Promise<WalletBalance>((resolve) =>
      setTimeout(() => {
        const mockData = {
          currency: 'USD',
          amount: 1250.50,
          transactions: [
            {
              id: '1',
              amount: 100,
              type: 'credit' as const,
              description: 'Arena win bonus',
              date: new Date(Date.now() - 86400000).toISOString(),
            },
            {
              id: '2',
              amount: -50,
              type: 'debit' as const,
              description: 'Arena entry fee',
              date: new Date(Date.now() - 172800000).toISOString(),
            },
          ],
        };
        resolve(WalletBalanceSchema.parse(mockData));
      }, 1200)
    );
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: Partial<UserProfile>): Promise<UserProfile> => {
    // TODO: Implement when backend is ready
    // const response = await api.patch<UserProfile>('/me', data);
    // return UserProfileSchema.parse(response.data);
    
    throw new Error('Not implemented');
  },
};
```

#### Step 2.3: Create Custom Hooks

**File:** `apps/mobile/src/core/hooks/useUser.ts` (NEW)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/userService';
import { UserProfile } from '../../types/user';

// Query keys for cache management
export const userKeys = {
  all: ['user'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  wallet: () => [...userKeys.all, 'wallet'] as const,
};

/**
 * Hook to fetch user profile with caching
 */
export const useUserProfile = () => {
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: userService.getProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to fetch wallet balance
 */
export const useWallet = () => {
  return useQuery({
    queryKey: userKeys.wallet(),
    queryFn: userService.getWallet,
    staleTime: 1000 * 30, // 30 seconds (financial data should be fresher)
  });
};

/**
 * Hook to update user profile
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<UserProfile>) => userService.updateProfile(data),
    onSuccess: (updatedProfile) => {
      // Update cache with new data
      queryClient.setQueryData(userKeys.profile(), updatedProfile);
    },
  });
};
```

---

### Phase 4.3: UI Implementation with Feedback
**Estimated Time:** 45 mins  
**Priority:** High

#### Step 3.1: Update Profile Screen

**File:** `apps/mobile/app/(tabs)/profile.tsx`

**Action:** Connect to data layer with loading/error states

```typescript
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useUserProfile, useWallet } from '../../src/core/hooks/useUser';
import { useAuth } from '../../src/core/hooks/useAuth';
import { toast } from 'sonner-native';

export default function ProfileScreen() {
  const { data: user, isLoading: userLoading, error: userError } = useUserProfile();
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  if (userLoading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-4 text-gray-600">Loading profile...</Text>
      </View>
    );
  }

  if (userError) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-red-500 text-lg font-semibold mb-2">Error Loading Profile</Text>
        <Text className="text-gray-600 text-center">
          {userError instanceof Error ? userError.message : 'Unknown error'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-6 pt-12 pb-6">
        {/* Header */}
        <Text className="text-3xl font-bold mb-8">Profile</Text>

        {/* User Info Card */}
        <View className="bg-gray-100 p-6 rounded-xl mb-4">
          <View className="mb-4">
            <Text className="text-gray-500 text-sm mb-1">Name</Text>
            <Text className="text-xl font-semibold">{user?.name}</Text>
          </View>
          
          <View>
            <Text className="text-gray-500 text-sm mb-1">Email</Text>
            <Text className="text-lg">{user?.email}</Text>
          </View>
        </View>

        {/* Wallet Card */}
        <View className="bg-blue-50 p-6 rounded-xl mb-6">
          <Text className="text-gray-600 text-sm mb-2">Wallet Balance</Text>
          {walletLoading ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <>
              <Text className="text-3xl font-bold text-blue-600 mb-4">
                ${wallet?.amount.toFixed(2)}
              </Text>
              {wallet?.transactions && wallet.transactions.length > 0 && (
                <View>
                  <Text className="text-gray-600 text-sm mb-2">Recent Transactions</Text>
                  {wallet.transactions.slice(0, 3).map((tx) => (
                    <View key={tx.id} className="flex-row justify-between py-2">
                      <Text className="text-gray-700">{tx.description}</Text>
                      <Text className={tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                        {tx.type === 'credit' ? '+' : '-'}${Math.abs(tx.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          className="bg-red-500 p-4 rounded-xl active:bg-red-600"
          onPress={handleLogout}
        >
          <Text className="text-white text-center font-bold text-lg">Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
```

#### Step 3.2: Add Error Boundary (Optional but Recommended)

**File:** `apps/mobile/src/components/ErrorBoundary.tsx` (NEW)

```typescript
import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-2xl font-bold text-red-500 mb-4">Something went wrong</Text>
          <Text className="text-gray-600 text-center mb-6">
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity
            className="bg-blue-500 px-6 py-3 rounded-lg"
            onPress={() => this.setState({ hasError: false, error: undefined })}
          >
            <Text className="text-white font-semibold">Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
```

---

### Phase 4.4: Notifications System
**Estimated Time:** 30 mins  
**Priority:** Medium (Can be deferred)

#### Step 4.1: Install Expo Notifications

```bash
cd apps/mobile
npx expo install expo-notifications
```

#### Step 4.2: Create Notifications Service

**File:** `apps/mobile/src/lib/notifications.ts` (NEW)

```typescript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and get push token
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  let token: string | undefined;

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // Return early if permission denied
  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return;
  }

  // Get push token
  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: 'your-project-id', // TODO: Add to env config
    });
    token = pushToken.data;
    console.log('Push Token:', token);
  } catch (error) {
    console.error('Error getting push token:', error);
  }

  // Android-specific channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  seconds: number = 0
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: seconds > 0 ? { seconds } : null,
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
```

#### Step 4.3: Add Notification Hook

**File:** `apps/mobile/src/core/hooks/useNotifications.ts` (NEW)

```typescript
import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../../lib/notifications';

export const useNotifications = () => {
  const [expoPushToken, setExpoPushToken] = useState<string>();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync().then((token) => setExpoPushToken(token));

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
      }
    );

    // Listen for notification interactions
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification tapped:', response);
        // TODO: Handle navigation based on notification data
      }
    );

    // Cleanup
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    expoPushToken,
  };
};
```

---

## 3. Testing Checklist

### Phase 4.1: Networking
- [ ] API client: Test token injection in request headers (verify it's the raw token, not JSON)
- [ ] Interceptors: Verify 401 triggers logout
- [ ] Query provider: Confirm queries work in all screens
- [ ] Token persistence: Verify auth token persists across app restarts

### Phase 4.2: Data Layer
- [ ] User profile: Loads correctly with loading state
- [ ] Wallet: Displays balance and transactions
- [ ] Error handling: Shows appropriate error messages
- [ ] Cache: Verify data persists between screen navigations

### Phase 4.3: UI Feedback
- [ ] Toast notifications: Success/error messages display
- [ ] Loading states: Spinners show during data fetch
- [ ] Error states: User-friendly error messages
- [ ] Logout: Clears cache and redirects to login

### Phase 4.4: Notifications
- [ ] Permission request: Prompts user appropriately
- [ ] Push token: Successfully retrieved and logged
- [ ] Local notifications: Can schedule and receive
- [ ] Notification tap: Logs interaction (navigation TBD)

---

## 4. Environment Configuration

**File:** `apps/mobile/.env.example` (NEW)

```env
# API Configuration
API_BASE_URL=https://api.walle-arena.com/v1
API_TIMEOUT=10000

# Expo Push Notifications
EXPO_PROJECT_ID=your-project-id

# Feature Flags
ENABLE_NOTIFICATIONS=true
ENABLE_ANALYTICS=false
```

---

## 5. Known Issues & Considerations

### Critical
1. **✅ FIXED: Zustand JSON Trap**: The spec now correctly reads token from `useAuthStore.getState().token` instead of raw storage, avoiding JSON parsing issues.
2. **✅ FIXED: Hydration Race Condition**: The interceptor now waits for Zustand hydration to complete, preventing unauthorized errors on slow devices.

### Important
2. **Mock Data**: All services currently use mock data. Replace with actual API calls when backend is ready.
3. **Error Messages**: Consider internationalization (i18n) for production.
4. **Network Offline**: Add offline detection and queue failed requests.

### Nice to Have
5. **Query Devtools**: Consider adding `@tanstack/react-query-devtools` for development.
6. **Retry Logic**: Implement exponential backoff for failed requests.
7. **Request Cancellation**: Cancel in-flight requests on screen unmount.

---

## 6. Next Steps After Phase 4

1. **Phase 5: Arena Features** - Implement game logic and real-time updates
2. **Phase 6: Social Features** - Add friends, chat, leaderboards
3. **Phase 7: Payments** - Integrate payment gateway for wallet top-ups
4. **Phase 8: Polish** - Animations, haptics, accessibility

---

## 7. Implementation Order

**Recommended sequence:**

1. ✅ **Start Here:** Phase 4.1 (Networking Infrastructure) - Foundation
2. ✅ Phase 4.2 (Services + Hooks) - Data layer
3. ✅ Phase 4.3 (UI Updates) - User-facing features
4. ⏸️ Phase 4.4 (Notifications) - Can be done later

**Estimated Total Time:** 2 - 2.5 hours

---

## 8. Success Criteria

Phase 4 is complete when:
- ✅ User can see their profile data loaded from service
- ✅ Wallet balance displays with loading state
- ✅ Toast notifications appear on logout
- ✅ 401 errors automatically log user out
- ✅ Data persists in cache between navigations
- ✅ App handles network errors gracefully

---

## 9. Why No MMKV Migration?

**Question:** The original spec mentioned MMKV. Why are we staying with AsyncStorage?

**Answer:** 
- Zustand's persist middleware handles AsyncStorage perfectly fine
- The store is hydrated synchronously on app launch, so `useAuthStore.getState().token` is always available
- MMKV would only provide marginal performance benefits for this use case
- AsyncStorage is simpler, has better ecosystem support, and is already working

**The Key Insight:** We don't need synchronous storage access because we're reading from the **hydrated Zustand store state**, not from raw storage. This avoids both the async problem AND the JSON parsing trap.

---

**Ready to implement? Start with Phase 4.1, Step 1.1 (Install Dependencies).**
