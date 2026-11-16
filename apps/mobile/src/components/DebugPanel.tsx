import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { API_BASE_URL } from '../common/constants';
import { isFeatureEnabled, logFeatureFlags } from '../config/featureFlags';
import { useAuthStore } from '../core/store/authStore';
import { useTournamentStore } from '../core/store/tournamentStore';
import { useRouter } from 'expo-router';

interface DebugLog {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

class DebugLogger {
  private static logs: DebugLog[] = [];
  private static listeners: ((logs: DebugLog[]) => void)[] = [];

  static addLog(message: string, type: 'info' | 'error' | 'success' = 'info') {
    // Only log if debug panel feature is enabled
    if (!isFeatureEnabled('debugPanel')) {
      return;
    }

    const log: DebugLog = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
    };
    
    this.logs.unshift(log); // Add to beginning
    if (this.logs.length > 50) {
      this.logs = this.logs.slice(0, 50); // Keep only last 50 logs
    }
    
    // Batch state updates to avoid render conflicts
    setTimeout(() => {
      this.listeners.forEach(listener => listener([...this.logs]));
    }, 0);
  }

  static subscribe(listener: (logs: DebugLog[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  static getLogs() {
    return [...this.logs];
  }
}

export { DebugLogger };

export const DebugPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>(DebugLogger.getLogs());
  const { isAuthenticated, logout } = useAuthStore();
  const { selectedTournament, clearSelection } = useTournamentStore();
  const router = useRouter();

  React.useEffect(() => {
    const unsubscribe = DebugLogger.subscribe(setLogs);
    // Log feature flags when debug panel mounts
    logFeatureFlags();
    return unsubscribe;
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Debug Logout',
      'This will log you out and clear all data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
            // Navigate to root to trigger proper flow
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleClearTournament = () => {
    Alert.alert(
      'Clear Tournament',
      'This will clear the selected tournament. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearSelection();
            // Navigate to root to trigger tournament selection
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleClearLogs = () => {
    // Clear logs by resetting the internal array
    (DebugLogger as any).logs = [];
    setLogs([]);
  };

  // Don't render anything if debug panel feature is disabled
  if (!isFeatureEnabled('debugPanel')) {
    return null;
  }

  if (!isVisible) {
    return (
      <TouchableOpacity
        style={styles.debugButton}
        onPress={() => setIsVisible(true)}
      >
        <Text style={styles.debugButtonText}>🐛</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setIsVisible(!isVisible)}
      >
        <Text style={styles.toggleButtonText}>
          {isVisible ? '❌ Close Debug' : '🐛 Debug'}
        </Text>
      </TouchableOpacity>

      {isVisible && (
        <View style={styles.panel}>
          <Text style={styles.title}>Debug Panel</Text>
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Configuration:</Text>
            <Text style={styles.configText}>Base URL: {API_BASE_URL}</Text>
            <Text style={styles.configText}>
              Env Var: {process.env.EXPO_PUBLIC_API_BASE_URL || 'Not set'}
            </Text>
            <Text style={styles.configText}>__DEV__: {__DEV__ ? 'true' : 'false'}</Text>
            <Text style={styles.configText}>
              Debug Panel Env: {process.env.EXPO_PUBLIC_DEBUG_PANEL || 'Not set'}
            </Text>
            <Text style={styles.configText}>
              Debug Panel Enabled: {isFeatureEnabled('debugPanel') ? 'true' : 'false'}
            </Text>
            
            <TouchableOpacity
              style={styles.testButton}
              onPress={async () => {
                try {
                  const response = await fetch(`${API_BASE_URL}/api/health`);
                  const data = await response.text();
                } catch (error) {
                  console.error('Network test failed:', error);
                }
              }}
            >
              <Text style={styles.testButtonText}>Test Network</Text>
            </TouchableOpacity>
          </View>

          {/* Auth & Tournament State */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>App State:</Text>
            <Text style={styles.configText}>
              Auth: {isAuthenticated ? '✅ Authenticated' : '❌ Not Authenticated'}
            </Text>
            <Text style={styles.configText}>
              Tournament: {selectedTournament ? `✅ ${selectedTournament.title}` : '❌ None Selected'}
            </Text>
            {selectedTournament && (
              <Text style={styles.configText}>
                Slug sent: {selectedTournament.slug}
              </Text>
            )}
            
            <View style={styles.buttonRow}>
              {isAuthenticated && (
                <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
                  <Text style={styles.actionButtonText}>🚪 Logout</Text>
                </TouchableOpacity>
              )}
              
              {selectedTournament && (
                <TouchableOpacity style={styles.actionButton} onPress={handleClearTournament}>
                  <Text style={styles.actionButtonText}>🏆 Clear Tournament</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: '#4ecdc4' }]} 
                onPress={() => {
                  clearSelection();
                  logout();
                  // Force navigation to root index to trigger tournament selection
                  router.replace('/');
                }}
              >
                <Text style={styles.actionButtonText}>🔄 Force Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.logHeader}>
              <Text style={styles.sectionTitle}>Logs:</Text>
              <TouchableOpacity style={styles.clearButton} onPress={handleClearLogs}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.logsContainer}>
              {logs.map((log, index) => (
                <View key={index} style={[styles.logItem, styles[log.type]]}>
                  <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                  <Text style={styles.logMessage}>{log.message}</Text>
                </View>
              ))}
              {logs.length === 0 && (
                <Text style={styles.noLogs}>No logs yet</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 10,
    zIndex: 9999,
  },
  debugButton: {
    backgroundColor: '#ff6b6b',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugButtonText: {
    fontSize: 20,
  },
  toggleButton: {
    backgroundColor: '#4ecdc4',
    padding: 8,
    borderRadius: 5,
    marginBottom: 5,
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  panel: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 15,
    borderRadius: 10,
    width: 300,
    maxHeight: 400,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    color: '#4ecdc4',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  configText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 2,
  },
  logsContainer: {
    maxHeight: 200,
  },
  logItem: {
    padding: 5,
    marginBottom: 2,
    borderRadius: 3,
  },
  info: {
    backgroundColor: 'rgba(74, 144, 226, 0.3)',
  },
  error: {
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
  },
  success: {
    backgroundColor: 'rgba(78, 205, 196, 0.3)',
  },
  logTimestamp: {
    color: '#ccc',
    fontSize: 10,
  },
  logMessage: {
    color: 'white',
    fontSize: 12,
  },
  noLogs: {
    color: '#ccc',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  testButton: {
    backgroundColor: '#4ecdc4',
    padding: 8,
    borderRadius: 5,
    marginTop: 5,
    alignItems: 'center',
  },
  testButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    backgroundColor: '#ff6b6b',
    padding: 6,
    borderRadius: 4,
    flex: 1,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  clearButton: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  clearButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});