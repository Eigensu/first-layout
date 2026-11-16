import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../src/theme';
import { adminService, Contest } from '../../../src/services/adminService';
import { 
  ContestDetailsTab,
  LeaderboardTab,
  EnrollmentTab,
  PlayerPointsTab
} from '../../../src/components/admin/contest';

type TabType = 'details' | 'leaderboard' | 'enrollment' | 'points';

export default function ContestManagement() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { contestId } = useLocalSearchParams<{ contestId: string }>();
  
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [error, setError] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    header: {
      backgroundColor: theme.bg.elevated,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingRight: 12,
    },
    backButtonText: {
      color: theme.accent.pink.primary,
      fontWeight: '600',
      marginLeft: 4,
      fontSize: 14,
    },
    refreshButton: {
      padding: 8,
    },
    contestInfo: {
      marginBottom: 12,
    },
    contestName: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text.main,
      marginBottom: 4,
    },
    contestMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    contestCode: {
      fontSize: 14,
      color: theme.text.muted,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: 'white',
    },
    contestDates: {
      fontSize: 12,
      color: theme.text.muted,
      marginTop: 4,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: theme.bg.elevated,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    activeTab: {
      borderBottomColor: theme.accent.pink.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text.muted,
    },
    activeTabText: {
      color: theme.accent.pink.primary,
    },
    content: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      fontSize: 16,
      color: theme.text.muted,
      marginTop: 16,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    errorText: {
      fontSize: 16,
      color: theme.status.danger,
      textAlign: 'center',
      marginTop: 16,
    },
  });

  const loadContest = async () => {
    if (!contestId) return;
    
    try {
      setLoading(true);
      setError(null);
      const contestData = await adminService.contests.get(contestId);
      setContest(contestData);
    } catch (error: any) {
      setError(error.message || 'Failed to load contest');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContest();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return '#10B981';
      case 'ongoing':
        return '#F59E0B';
      case 'completed':
        return '#6B7280';
      case 'archived':
        return '#9CA3AF';
      default:
        return '#6B7280';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const tabs = [
    { key: 'details' as TabType, label: 'Details', icon: 'settings-outline' },
    { key: 'leaderboard' as TabType, label: 'Leaderboard', icon: 'trophy-outline' },
    { key: 'enrollment' as TabType, label: 'Teams', icon: 'people-outline' },
    { key: 'points' as TabType, label: 'Points', icon: 'star-outline' },
  ];

  const renderTabContent = () => {
    if (!contest) return null;

    switch (activeTab) {
      case 'details':
        return (
          <ContestDetailsTab 
            contest={contest} 
            onUpdate={setContest}
            onRefresh={loadContest}
          />
        );
      case 'leaderboard':
        return <LeaderboardTab contestId={contestId!} />;
      case 'enrollment':
        return <EnrollmentTab contestId={contestId!} contest={contest} />;
      case 'points':
        return <PlayerPointsTab contestId={contestId!} />;
      default:
        return null;
    }
  };

  useEffect(() => {
    loadContest();
  }, [contestId]);

  if (loading && !contest) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={styles.loadingText}>Loading contest...</Text>
        </View>
      </View>
    );
  }

  if (error && !contest) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.status.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={{
              marginTop: 16,
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: theme.accent.pink.primary,
              borderRadius: 8,
            }}
            onPress={loadContest}
          >
            <Text style={{ color: 'white', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color={theme.accent.pink.primary} />
            <Text style={styles.backButtonText}>Contests</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons 
              name={refreshing ? "hourglass-outline" : "refresh-outline"} 
              size={20} 
              color={theme.accent.pink.primary} 
            />
          </TouchableOpacity>
        </View>

        {contest && (
          <View style={styles.contestInfo}>
            <Text style={styles.contestName}>{contest.name}</Text>
            <View style={styles.contestMeta}>
              <Text style={styles.contestCode}>{contest.code}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(contest.status) },
                ]}
              >
                <Text style={styles.statusText}>{contest.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.contestCode}>{contest.visibility}</Text>
              <Text style={styles.contestCode}>{contest.contest_type}</Text>
            </View>
            <Text style={styles.contestDates}>
              {formatDate(contest.start_at)} - {formatDate(contest.end_at)}
            </Text>
          </View>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.key ? theme.accent.pink.primary : theme.text.muted}
              style={{ marginBottom: 4 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderTabContent()}
      </View>
    </View>
  );
}