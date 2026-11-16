import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../theme';
import { adminService } from '../../../services/adminService';

interface PlayerPoint {
  player_id: string;
  name?: string;
  team?: string;
  points: number;
  updated_at: string;
}

interface PlayerPointsTabProps {
  contestId: string;
}

export const PlayerPointsTab: React.FC<PlayerPointsTabProps> = ({ contestId }) => {
  const { theme } = useThemeContext();
  const [playerPoints, setPlayerPoints] = useState<PlayerPoint[]>([]);
  const [editedPoints, setEditedPoints] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
    },
    saveButton: {
      backgroundColor: theme.accent.pink.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    saveButtonDisabled: {
      backgroundColor: theme.text.muted,
    },
    saveButtonText: {
      color: 'white',
      fontWeight: '600',
      marginLeft: 4,
    },
    searchContainer: {
      marginBottom: 16,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: theme.text.main,
      backgroundColor: theme.bg.elevated,
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
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
      alignItems: 'center',
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    playerCell: {
      flex: 2,
    },
    teamCell: {
      flex: 2,
    },
    pointsCell: {
      flex: 1,
    },
    updatedCell: {
      flex: 1,
    },
    playerName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
    teamName: {
      fontSize: 14,
      color: theme.text.main,
    },
    pointsInput: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 6,
      padding: 8,
      fontSize: 14,
      color: theme.text.main,
      backgroundColor: theme.bg.body,
      textAlign: 'center',
    },
    updatedText: {
      fontSize: 12,
      color: theme.text.muted,
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
    bulkActions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    bulkButton: {
      flex: 1,
      backgroundColor: theme.bg.elevated,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      alignItems: 'center',
    },
    bulkButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
    statsContainer: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    statsLabel: {
      fontSize: 14,
      color: theme.text.muted,
    },
    statsValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
  });

  const loadPlayerPoints = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminService.contests.getPlayerPoints(contestId);
      setPlayerPoints(response);
      
      // Initialize edited points with current values
      const initialPoints: Record<string, string> = {};
      response.forEach((player) => {
        initialPoints[player.player_id] = String(player.points || 0);
      });
      setEditedPoints(initialPoints);
    } catch (error: any) {
      setError(error.message || 'Failed to load player points');
    } finally {
      setLoading(false);
    }
  };

  const savePlayerPoints = async () => {
    try {
      setSaving(true);
      
      const updates = playerPoints.map((player) => ({
        player_id: player.player_id,
        points: Number(editedPoints[player.player_id] || 0),
      }));

      await adminService.contests.updatePlayerPoints(contestId, updates);
      await loadPlayerPoints(); // Reload to get updated timestamps
      
      Alert.alert('Success', 'Player points updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save player points');
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayerPoints();
    setRefreshing(false);
  };

  const updatePlayerPoints = (playerId: string, points: string) => {
    setEditedPoints(prev => ({
      ...prev,
      [playerId]: points,
    }));
  };

  const resetAllPoints = () => {
    Alert.alert(
      'Reset All Points',
      'Are you sure you want to reset all player points to 0?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const resetPoints: Record<string, string> = {};
            playerPoints.forEach((player) => {
              resetPoints[player.player_id] = '0';
            });
            setEditedPoints(resetPoints);
          },
        },
      ]
    );
  };

  const addBonusPoints = () => {
    Alert.prompt(
      'Add Bonus Points',
      'Enter bonus points to add to all players:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: (bonusText?: string) => {
            const bonus = Number(bonusText || 0);
            if (isNaN(bonus)) {
              Alert.alert('Error', 'Please enter a valid number');
              return;
            }
            
            const updatedPoints: Record<string, string> = {};
            playerPoints.forEach((player) => {
              const currentPoints = Number(editedPoints[player.player_id] || 0);
              updatedPoints[player.player_id] = String(currentPoints + bonus);
            });
            setEditedPoints(updatedPoints);
          },
        },
      ],
      'plain-text',
      '0'
    );
  };

  const filteredPlayers = playerPoints.filter((player) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      player.name?.toLowerCase().includes(query) ||
      player.team?.toLowerCase().includes(query)
    );
  });

  const hasChanges = playerPoints.some((player) => {
    return String(player.points) !== editedPoints[player.player_id];
  });

  const totalPoints = filteredPlayers.reduce((sum, player) => {
    return sum + Number(editedPoints[player.player_id] || 0);
  }, 0);

  const averagePoints = filteredPlayers.length > 0 ? totalPoints / filteredPlayers.length : 0;

  useEffect(() => {
    loadPlayerPoints();
  }, [contestId]);

  if (loading && playerPoints.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={styles.loadingText}>Loading player points...</Text>
        </View>
      </View>
    );
  }

  if (error && playerPoints.length === 0) {
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
        <Text style={styles.title}>Player Points</Text>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!hasChanges || saving) && styles.saveButtonDisabled,
          ]}
          onPress={savePlayerPoints}
          disabled={!hasChanges || saving}
        >
          <Ionicons name="save-outline" size={16} color="white" />
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Total Players</Text>
          <Text style={styles.statsValue}>{filteredPlayers.length}</Text>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statsLabel}>Total Points</Text>
          <Text style={styles.statsValue}>{totalPoints.toFixed(2)}</Text>
        </View>
        <View style={[styles.statsRow, { marginBottom: 0 }]}>
          <Text style={styles.statsLabel}>Average Points</Text>
          <Text style={styles.statsValue}>{averagePoints.toFixed(2)}</Text>
        </View>
      </View>

      {/* Bulk Actions */}
      <View style={styles.bulkActions}>
        <TouchableOpacity style={styles.bulkButton} onPress={resetAllPoints}>
          <Text style={styles.bulkButtonText}>Reset All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bulkButton} onPress={addBonusPoints}>
          <Text style={styles.bulkButtonText}>Add Bonus</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search players or teams..."
          placeholderTextColor={theme.text.muted}
        />
      </View>

      {filteredPlayers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="star-outline" size={48} color={theme.text.muted} />
          <Text style={styles.emptyText}>
            {searchQuery ? 'No players found' : 'No player points data'}
          </Text>
        </View>
      ) : (
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.playerCell]}>Player</Text>
            <Text style={[styles.tableHeaderText, styles.teamCell]}>Team</Text>
            <Text style={[styles.tableHeaderText, styles.pointsCell]}>Points</Text>
            <Text style={[styles.tableHeaderText, styles.updatedCell]}>Updated</Text>
          </View>

          {/* Table Rows */}
          {filteredPlayers.map((player, index) => (
            <View
              key={player.player_id}
              style={[
                styles.tableRow,
                index === filteredPlayers.length - 1 && styles.lastRow,
              ]}
            >
              <View style={styles.playerCell}>
                <Text style={styles.playerName}>
                  {player.name || `Player ${player.player_id}`}
                </Text>
              </View>
              
              <View style={styles.teamCell}>
                <Text style={styles.teamName}>
                  {player.team || 'Unknown'}
                </Text>
              </View>
              
              <View style={styles.pointsCell}>
                <TextInput
                  style={styles.pointsInput}
                  value={editedPoints[player.player_id] || '0'}
                  onChangeText={(text) => updatePlayerPoints(player.player_id, text)}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
              
              <View style={styles.updatedCell}>
                <Text style={styles.updatedText}>
                  {new Date(player.updated_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};