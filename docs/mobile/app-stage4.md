This is the technical specification for Phase 4: Data Integration & Advanced Features.Now that the "Skeleton" (Phase 3) is built, Phase 4 focuses on the "Nervous System"—connecting your app to the outside world, handling errors gracefully, and managing data flow.Phase 4: Data Integration & Feature ImplementationProject: Wall-E Arena (Mobile)Phase: 4 - Networking, Data Sync, Notifications, & FeedbackDate: November 29, 2025Dependencies: Phase 3 (Completed)1. Executive SummaryThe goal of this phase is to transition from a static UI to a dynamic, data-driven application. We will implement TanStack Query (React Query) for efficient server-state management, Axios for HTTP requests with robust interceptors (for automatic token injection), and a global Error Boundary system. We will also integrate Expo Notifications for user engagement.2. Technology Stack AdditionsComponentLibraryRationaleData Fetching@tanstack/react-queryIndustry standard for caching, background updates, and loading states.HTTP ClientaxiosRobust handling of request/response interceptors (Auth headers).Notificationsexpo-notificationsUnified API for push/local notifications on iOS/Android.Toastssonner-nativeModern, beautiful, non-blocking success/error alerts.ValidationzodRuntime schema validation for API responses (safety).3. Architecture: The Data FlowWe are moving away from useEffect for data fetching. Instead, we use the Client-Server Synchronization pattern.A. The Networking LayerAxios Instance: A singleton that automatically injects the Bearer token from MMKV into every request.Interceptors: A global response interceptor that listens for 401 Unauthorized. If detected, it automatically calls authStore.logout() and redirects the user to Login.B. The Query LayerQuery Keys: Strict management of cache keys (e.g., ['user', 'profile']).Stale-While-Revalidate: The UI shows cached data instantly while fetching fresh data in the background.4. Implementation RoadmapPhase 4.1: Networking InfrastructureEstimated Time: 45 minsPhase 4.2: User Profile & Wallet LogicEstimated Time: 45 minsPhase 4.3: UI Feedback (Toasts & Errors)Estimated Time: 30 minsPhase 4.4: Notifications SystemEstimated Time: 30 minsPhase 4.1: Networking InfrastructureStep 1: Install DependenciesBash# Data Fetching & HTTP
pnpm add @tanstack/react-query axios zod

# UI Feedback
pnpm add sonner-native
Step 2: Configure The Query ProviderWrap the app in the Query Client so hooks work everywhere.File: apps/mobile/app/_layout.tsx (Update)TypeScriptimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner-native';

// Create a client outside the component
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // Data is fresh for 1 minute
    },
  },
});

export default function RootLayout() {
  // ... existing auth logic ...

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <Toaster /> {/* Global Toast Component */}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
Step 3: Create the Axios ClientThis file handles the "dirty work" of authentication headers.File: apps/mobile/src/lib/api-client.tsTypeScriptimport axios from 'axios';
import { storage, StorageKeys } from './storage';
import { useAuthStore } from '../core/store/authStore';

// TODO: Move to .env
const BASE_URL = 'https://api.walle-arena.com/v1'; 

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Add Token
api.interceptors.request.use((config) => {
  const token = storage.getString(StorageKeys.AUTH_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid -> Logout user immediately
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
Phase 4.2: User Profile & Wallet LogicStep 1: Define ServicesSeparate the "API Call" from the "React Component".File: apps/mobile/src/services/userService.tsTypeScriptimport { api } from '../lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface WalletBalance {
  currency: string;
  amount: number;
  transactions: Array<{ id: string; amount: number; date: string }>;
}

export const userService = {
  getProfile: async () => {
    // Mocking response for dev phase
    // return api.get<UserProfile>('/me').then(res => res.data);
    
    // MOCK:
    return new Promise<UserProfile>((resolve) => 
      setTimeout(() => resolve({
        id: '123',
        email: 'user@walle.com',
        name: 'Wall-E Pilot',
      }), 1000)
    );
  },

  getWallet: async () => {
    // Mocking response
    return new Promise<WalletBalance>((resolve) => 
      setTimeout(() => resolve({
        currency: 'USD',
        amount: 1250.50,
        transactions: [],
      }), 1000)
    );
  },
};
Step 2: Create Custom HooksFile: apps/mobile/src/core/hooks/useUser.tsTypeScriptimport { useQuery } from '@tanstack/react-query';
import { userService } from '../../services/userService';

export const useUserProfile = () => {
  return useQuery({
    queryKey: ['user', 'profile'],
    queryFn: userService.getProfile,
  });
};

export const useWallet = () => {
  return useQuery({
    queryKey: ['user', 'wallet'],
    queryFn: userService.getWallet,
  });
};
Phase 4.3: UI ImplementationStep 1: Update Profile ScreenFile: apps/mobile/app/(tabs)/profile.tsxTypeScriptimport { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUserProfile } from '../../src/core/hooks/useUser';
import { useAuth } from '../../src/core/hooks/useAuth';
import { toast } from 'sonner-native';

export default function ProfileScreen() {
  const { data: user, isLoading, error } = useUserProfile();
  const { logout } = useAuth();

  if (isLoading) return <ActivityIndicator className="flex-1" />;
  if (error) return <Text>Error loading profile</Text>;

  return (
    <View className="flex-1 bg-white px-6 pt-12">
      <Text className="text-3xl font-bold mb-8">Profile</Text>
      
      <View className="bg-gray-100 p-4 rounded-xl mb-4">
        <Text className="text-gray-500">Name</Text>
        <Text className="text-xl font-semibold">{user?.name}</Text>
      </View>

      <TouchableOpacity 
        className="bg-red-500 p-4 rounded-xl"
        onPress={() => {
          logout();
          toast.success('Logged out successfully');
        }}
      >
        <Text className="text-white text-center font-bold">Logout</Text>
      </TouchableOpacity>
    </View>
  );
}
Phase 4.4: Notifications (Optional but recommended)Step 1: InstallBashnpx expo install expo-notifications
Step 2: Configure ListenerFile: apps/mobile/src/lib/notifications.tsTypeScriptimport * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    return;
  }
  
  // Get the token
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('Push Token:', token);
  return token;
}
5. Next ActionsYou should proceed in this order:Dependencies: Install Query, Axios, and Sonner.Infrastructure: Set up _layout provider and api-client.ts.Services: Create the mock user service.UI: Connect the Profile screen to the data.Do you want to start by installing the dependencies for Phase 4.1?