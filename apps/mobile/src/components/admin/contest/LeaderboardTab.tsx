import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../theme';

interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  teamName: string;
  points: number;
}

interface LeaderboardTabProps {
  contestId: string;
}

export const LeaderboardTab: React.FC<LeaderboardTabProps> = ({ contestId }) => {
  const { theme } = useThemeContext();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      marginLeft: 8,
    },
    table: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: theme.bg.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    tableHeaderText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    tableCell: {
      fontSize: 14,
      color: theme.text.main,
    },
    rankCell: {
      width: 50,
      fontWeight: '600',
    },
    userCell: {
      flex: 2,
    },
    teamCell: {
      flex: 2,
    },
    pointsCell: {
      width: 80,
      textAlign: 'right',
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    emptyText: {
      fontSize: 16,
      color: theme.text.muted,
      marginTop: 16,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      fontSize: 16,
      color: theme.text.muted,
      marginTop: 16,
    },
    errorContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    errorText: {
      fontSize: 16,
      color: theme.status.danger,
      marginTop: 16,
      textAlign: 'center',
    },
    topRankBadge: {
      backgroundColor: '#FFD700',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      marginRight: 8,
    },
    topRankText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#000',
    },
  });

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Mock API call - replace with actual API
      // const response = await publicContestsApi.leaderboard(contestId, { limit: 100 });
      
      // Mock data for now
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData: LeaderboardEntry[] = [
        {
          rank: 1,
          username: 'player1',
          displayName: 'John Doe',
          teamName: 'Team Alpha',
          points: 1250.5,
        },
        {
          rank: 2,
          username: 'player2',
          displayName: 'Jane Smith',
          teamName: 'Team Beta',
          points: 1180.0,
        },
        {
          rank: 3,
          username: 'player3',
          displayName: 'Mike Johnson',
          teamName: 'Team Gamma',
          points: 1050.25,
        },
        {
          rank: 4,
          username: 'player4',
          displayName: 'Sarah Wilson',
          teamName: 'Team Delta',
          points: 980.75,
        },
        {
          rank: 5,
          username: 'player5',
          displayName: 'Chris Brown',
          teamName: 'Team Epsilon',
          points: 920.0,
        },
      ];
      
      setLeaderboard(mockData);
    } catch (error: any) {
      setError(error.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  const getRankDisplay = (rank: number) => {
    if (rank <= 3) {
      const badges = ['🥇', '🥈', '🥉'];
      return badges[rank - 1];
    }
    return rank.toString();
  };

  useEffect(() => {
    loadLeaderboard();
  }, [contestId]);

  if (loading && leaderboard.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={styles.loadingText}>Loading leaderboard...</Text>
        </View>
      </View>
    );
  }

  if (error && leaderboard.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={theme.status.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Ionicons name="trophy" size={24} color={theme.accent.pink.primary} />
        <Text style={styles.title}>Leaderboard (Top 100)</Text>
      </View>

      {leaderboard.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={48} color={theme.text.muted} />
          <Text style={styles.emptyText}>No entries yet</Text>
        </View>
      ) : (
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.rankCell]}>Rank</Text>
            <Text style={[styles.tableHeaderText, styles.userCell]}>User</Text>
            <Text style={[styles.tableHeaderText, styles.teamCell]}>Team</Text>
            <Text style={[styles.tableHeaderText, styles.pointsCell]}>Points</Text>
          </View>

          {/* Table Rows */}
          {leaderboard.map((entry, index) => (
            <View
              key={`${entry.rank}-${entry.username}`}
              style={[
                styles.tableRow,
                index === leaderboard.length - 1 && styles.lastRow,
              ]}
            >
              <View style={[styles.rankCell, { flexDirection: 'row', alignItems: 'center' }]}>
                <Text style={[styles.tableCell, styles.rankCell]}>
                  {getRankDisplay(entry.rank)}
                </Text>
              </View>
              
              <View style={styles.userCell}>
                <Text style={[styles.tableCell, { fontWeight: '600' }]}>
                  {entry.displayName}
                </Text>
                <Text style={[styles.tableCell, { fontSize: 12, color: theme.text.muted }]}>
                  @{entry.username}
                </Text>
              </View>
              
              <Text style={[styles.tableCell, styles.teamCell]}>
                {entry.teamName}
              </Text>
              
              <Text style={[styles.tableCell, styles.pointsCell]}>
                {entry.points.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};