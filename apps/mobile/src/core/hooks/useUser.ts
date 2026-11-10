import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../services/userService';
import { UserProfile } from '../../types/user';
import { useAuthStore } from '../store/authStore';

// Query keys for cache management
export const userKeys = {
    all: ['user'] as const,
    profile: () => [...userKeys.all, 'profile'] as const,
    wallet: () => [...userKeys.all, 'wallet'] as const,
};

/**
 * Hook to fetch user profile with caching
 *
 * Gated on isAuthenticated: a guest has no token, so this call always 401s,
 * which the api-client's interceptor treats as a logout — firing it
 * unconditionally on every guest screen was pointless network traffic at
 * best, and at worst (paired with a logout that clears the query cache)
 * a self-sustaining refetch loop.
 */
export const useUserProfile = () => {
    const { isAuthenticated } = useAuthStore();
    return useQuery({
        queryKey: userKeys.profile(),
        queryFn: userService.getProfile,
        staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: isAuthenticated,
    });
};

/**
 * Hook to fetch wallet balance
 */
export const useWallet = () => {
    const { isAuthenticated } = useAuthStore();
    return useQuery({
        queryKey: userKeys.wallet(),
        queryFn: userService.getWallet,
        staleTime: 1000 * 30, // 30 seconds (financial data should be fresher)
        enabled: isAuthenticated,
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
