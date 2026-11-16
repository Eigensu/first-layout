import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../theme';
import { useUserProfile } from '../../core/hooks/useUser';
import { useAuthStore } from '../../core/store/authStore';

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { theme } = useThemeContext();
  const { isAuthenticated } = useAuthStore();
  // Disabled entirely for guests (no token to check), so isLoading only
  // means something while there's actually a fetch in flight.
  const { data: userProfile, isLoading, error } = useUserProfile();
  const router = useRouter();

  // Debug logging to debug panel only
  React.useEffect(() => {
    try {
      const { DebugLogger } = require('../../components/DebugPanel');
      DebugLogger.addLog(`AdminGuard - Loading: ${isLoading}`, 'info');
      DebugLogger.addLog(`AdminGuard - User Profile: ${userProfile ? 'loaded' : 'null'}`, 'info');
      if (error) {
        DebugLogger.addLog(`AdminGuard - Error: ${error.message || 'Unknown error'}`, 'error');
      }
    } catch {
      // DebugLogger not available, skip logging
    }
  }, [isLoading, userProfile, error]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    errorIcon: {
      marginBottom: 16,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text.main,
      marginBottom: 8,
      textAlign: 'center',
    },
    errorMessage: {
      fontSize: 16,
      color: theme.text.subtle,
      textAlign: 'center',
      lineHeight: 22,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontSize: 16,
      color: theme.text.subtle,
      marginTop: 16,
    },
  });

  // Show loading state while checking user profile
  if (isAuthenticated && isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="hourglass" size={48} color={theme.text.subtle} />
          <Text style={styles.loadingText}>Checking permissions...</Text>
        </View>
      </View>
    );
  }

  // Show error state if there's an error loading user profile
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons 
            name="warning-outline" 
            size={64} 
            color="#EF4444" 
            style={styles.errorIcon}
          />
          <Text style={styles.errorTitle}>Error Loading Profile</Text>
          <Text style={styles.errorMessage}>
            Unable to verify admin access. Please try logging in again.
          </Text>
        </View>
      </View>
    );
  }

  // Check if user has admin access. Deny by default — a guest (no query, no
  // data) must fall into this branch just as surely as a signed-in non-admin
  // does, not slip through to children because userProfile is merely absent.
  if (!userProfile?.isAdmin) {
    // Redirect back to main app after a short delay
    setTimeout(() => {
      router.replace('/(tabs)');
    }, 3000);

    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons 
            name="shield-outline" 
            size={64} 
            color="#EF4444" 
            style={styles.errorIcon}
          />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorMessage}>
            You don't have permission to access the admin panel. 
            You'll be redirected back to the main app.
          </Text>
        </View>
      </View>
    );
  }

  // User has admin access, render children
  return <>{children}</>;
};