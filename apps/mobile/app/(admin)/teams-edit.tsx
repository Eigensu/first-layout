import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/theme';
import { adminService, type Contest, type AdminPlayer, type PlayerPointsItem } from '../../src/services/adminService';


interface TeamGroup {
  teamName: string;
  players: AdminPlayer[];
}

export default function TeamsEditScreen() {
  const { theme } = useThemeContext();
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>('');
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [contestPoints, setContestPoints] = useState<Record<string, number>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [contestsLoading, setContestsLoading] = useState(true);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [savingTeam, setSavingTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContestModal, setShowContestModal] = useState(false);

  const selectedContest = useMemo(() => 
    contests.find(c => c.id === selectedContestId) || null,
    [contests, selectedContestId]
  );

  const teamGroups = useMemo(() => {
    const groups = new Map<string, AdminPlayer[]>();
    
    for (const player of players) {
      const teamName = player.team || 'Unassigned';
      if (!groups.has(teamName)) {
        groups.set(teamName, []);
      }
      groups.get(teamName)!.push(player);
    }

    // Sort players within each team
    Array.from(groups.values()).forEach(teamPlayers => 
      teamPlayers.sort((a, b) => a.name.localeCompare(b.name))
    );

    let entries = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Filter by allowed teams if it's a daily contest
    if (selectedContest?.contest_type === 'daily' && selectedContest.allowed_teams?.length) {
      const allowedSet = new Set(selectedContest.allowed_teams.map(t => (t || '').trim()));
      entries = entries.filter(([teamName]) => allowedSet.has(teamName));
    }

    return entries.map(([teamName, players]) => ({ teamName, players }));
  }, [players, selectedContest]);

  const filteredTeams = useMemo(() => {
    if (!teamFilter) return teamGroups;
    return teamGroups.filter(team => 
      team.teamName.toLowerCase().includes(teamFilter.toLowerCase())
    );
  }, [teamGroups, teamFilter]);

  useEffect(() => {
    loadContests();
  }, []);

  useEffect(() => {
    if (selectedContestId) {
      loadPlayersAndPoints();
    }
  }, [selectedContestId]);

  const loadContests = async () => {
    try {
      setContestsLoading(true);
      setError(null);
      
      let response;
      try {
        response = await adminService.contests.list();
      } catch (firstError) {
        response = await adminService.contests.list({ 
          page_size: 100,
        });
      }
      
      if (response && response.contests) {
        setContests(response.contests);
        
        if (response.contests.length === 0) {
          setError('No contests found. Please create a contest first.');
        } else {
          if (!selectedContestId && response.contests.length > 0) {
            setSelectedContestId(response.contests[0].id);
          }
        }
      } else {
        setError('Invalid response from server. Please try again.');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
      setError(`Failed to load contests: ${errorMessage}`);
    } finally {
      setContestsLoading(false);
    }
  };

  const loadPlayersAndPoints = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all players
      let allPlayers: AdminPlayer[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await adminService.players.list({ 
          page, 
          page_size: 100 
        });
        allPlayers = [...allPlayers, ...response.players];
        hasMore = response.players.length === 100;
        page++;
        
        // Safety break
        if (page > 100) break;
      }

      setPlayers(allPlayers);

      // Load contest points
      setPointsLoading(true);
      const pointsResponse = await adminService.contests.getPlayerPoints(selectedContestId);
      const pointsMap: Record<string, number> = {};
      const editMap: Record<string, string> = {};

      pointsResponse.forEach(item => {
        pointsMap[item.player_id] = item.points || 0;
        editMap[item.player_id] = formatPoints(item.points || 0);
      });

      setContestPoints(pointsMap);
      setEditValues(editMap);

    } catch (err) {
      setError('Failed to load players and points');
    } finally {
      setLoading(false);
      setPointsLoading(false);
    }
  };

  const formatPoints = (points: number): string => {
    return points.toFixed(3);
  };

  const parsePoints = (value: string): number => {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  };

  const handlePointsChange = (playerId: string, value: string) => {
    setEditValues(prev => ({ ...prev, [playerId]: value }));
  };

  const handlePointsBlur = (playerId: string, value: string) => {
    const points = parsePoints(value);
    setContestPoints(prev => ({ ...prev, [playerId]: points }));
    setEditValues(prev => ({ ...prev, [playerId]: formatPoints(points) }));
  };

  const saveTeamPoints = async (team: TeamGroup) => {
    if (!selectedContestId) return;

    try {
      setSavingTeam(team.teamName);
      
      const updates: PlayerPointsItem[] = team.players.map(player => ({
        player_id: player.id,
        points: contestPoints[player.id] || 0,
      }));

      await adminService.contests.updatePlayerPoints(selectedContestId, updates);
      
      Alert.alert('Success', `${team.teamName} points updated successfully`);
      
      // Refresh points to get server state
      await loadPlayersAndPoints();
      
    } catch (err) {
      Alert.alert('Error', 'Failed to save team points');
    } finally {
      setSavingTeam(null);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    header: {
      padding: 16,
      backgroundColor: theme.bg.elevated,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    headerTitle: {
      fontSize: 16,
      color: theme.text.subtle,
      marginBottom: 12,
    },
    contestSelector: {
      marginBottom: 12,
    },
    contestLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.text.main,
      marginBottom: 8,
    },
    picker: {
      backgroundColor: theme.bg.body,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pickerText: {
      fontSize: 16,
      color: theme.text.main,
      flex: 1,
    },
    placeholderText: {
      color: theme.text.subtle,
    },
    filterInput: {
      backgroundColor: theme.bg.body,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text.main,
    },
    contestInfo: {
      marginTop: 8,
      padding: 8,
      backgroundColor: theme.bg.body,
      borderRadius: 6,
    },
    contestInfoText: {
      fontSize: 12,
      color: theme.text.subtle,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 16,
      color: theme.status.danger,
      textAlign: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    emptyText: {
      fontSize: 16,
      color: theme.text.subtle,
      textAlign: 'center',
    },
    teamCard: {
      margin: 16,
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      overflow: 'hidden',
    },
    teamHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    teamName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
    },
    teamInfo: {
      fontSize: 14,
      color: theme.text.subtle,
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
      backgroundColor: theme.text.subtle,
    },
    saveButtonText: {
      color: 'white',
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 4,
    },
    playersTable: {
      padding: 16,
    },
    tableHeader: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
      marginBottom: 8,
    },
    tableHeaderText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text.subtle,
      textTransform: 'uppercase',
    },
    playerNameHeader: {
      flex: 2,
    },
    pointsHeader: {
      flex: 1,
      textAlign: 'center',
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle + '30',
    },
    playerName: {
      flex: 2,
      fontSize: 14,
      color: theme.text.main,
    },
    pointsInputContainer: {
      flex: 1,
      alignItems: 'center',
    },
    pointsInput: {
      backgroundColor: theme.bg.body,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 14,
      color: theme.text.main,
      textAlign: 'center',
      minWidth: 80,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.bg.elevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
    },
    closeButton: {
      padding: 4,
    },
    modalBody: {
      padding: 16,
    },
    emptyModalContainer: {
      alignItems: 'center',
      padding: 32,
    },
    emptyModalText: {
      fontSize: 16,
      color: theme.text.subtle,
      textAlign: 'center',
      marginTop: 12,
    },
    contestOption: {
      backgroundColor: theme.bg.body,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectedContestOption: {
      backgroundColor: theme.accent.pink.primary + '10',
      borderColor: theme.accent.pink.primary,
    },
    contestOptionContent: {
      flex: 1,
    },
    contestOptionName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text.main,
      marginBottom: 4,
    },
    selectedContestOptionText: {
      color: theme.accent.pink.primary,
    },
    contestOptionDetails: {
      fontSize: 12,
      color: theme.text.subtle,
    },

    emptyModalSubtext: {
      fontSize: 14,
      color: theme.text.subtle,
      textAlign: 'center',
      marginTop: 8,
    },
  });

  if (contestsLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Edit by Teams' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={[styles.emptyText, { marginTop: 16 }]}>Loading contests...</Text>
        </View>
      </View>
    );
  }

  if (!selectedContestId) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Edit by Teams' }} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Edit player points organized by teams for selected contest
          </Text>
          <View style={styles.contestSelector}>
            <Text style={styles.contestLabel}>Select Contest</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowContestModal(true)}
            >
              <Text style={[styles.pickerText, !selectedContestId && styles.placeholderText]}>
                {selectedContestId ? selectedContest?.name : "Choose a contest to edit team points"}
              </Text>
              <Ionicons name="chevron-down" size={20} color={theme.text.subtle} />
            </TouchableOpacity>
          </View>
          
          {error && (
            <View style={styles.contestInfo}>
              <Text style={[styles.contestInfoText, { color: theme.status.danger }]}>
                Error: {error}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="trophy-outline" size={64} color={theme.text.subtle} />
          <Text style={styles.emptyText}>
            Please select a contest to edit player points by teams
          </Text>
          {contests.length === 0 && !contestsLoading && (
            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 16 }]}
              onPress={loadContests}
            >
              <Ionicons name="refresh" size={16} color="white" />
              <Text style={styles.saveButtonText}>Reload Contests</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Edit by Teams' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={[styles.emptyText, { marginTop: 16 }]}>Loading players...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Edit by Teams' }} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.status.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.saveButton, { marginTop: 16 }]}
            onPress={loadPlayersAndPoints}
          >
            <Ionicons name="refresh" size={16} color="white" />
            <Text style={styles.saveButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Edit by Teams' }} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Edit player points organized by teams for selected contest
        </Text>
        
        <View style={styles.contestSelector}>
          <Text style={styles.contestLabel}>Contest</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowContestModal(true)}
          >
            <Text style={[styles.pickerText, !selectedContestId && styles.placeholderText]}>
              {selectedContest?.name || "Select contest"}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.text.subtle} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.filterInput}
          placeholder="Filter teams..."
          placeholderTextColor={theme.text.subtle}
          value={teamFilter}
          onChangeText={setTeamFilter}
        />

        {selectedContest && (
          <View style={styles.contestInfo}>
            <Text style={styles.contestInfoText}>
              {selectedContest.name} • {new Date(selectedContest.start_at).toLocaleDateString()} → {new Date(selectedContest.end_at).toLocaleDateString()} • {selectedContest.contest_type}
              {selectedContest.contest_type === 'daily' && selectedContest.allowed_teams?.length ? 
                ` • Allowed Teams: ${selectedContest.allowed_teams.length}` : ''}
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {filteredTeams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={theme.text.subtle} />
            <Text style={styles.emptyText}>
              No teams match your filter
            </Text>
          </View>
        ) : (
          filteredTeams.map((team) => (
            <View key={team.teamName} style={styles.teamCard}>
              <View style={styles.teamHeader}>
                <View>
                  <Text style={styles.teamName}>{team.teamName}</Text>
                  <Text style={styles.teamInfo}>{team.players.length} players</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (savingTeam === team.teamName || pointsLoading) && styles.saveButtonDisabled
                  ]}
                  onPress={() => saveTeamPoints(team)}
                  disabled={savingTeam === team.teamName || pointsLoading}
                >
                  {savingTeam === team.teamName ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="save" size={16} color="white" />
                  )}
                  <Text style={styles.saveButtonText}>
                    {savingTeam === team.teamName ? 'Saving...' : 'Save Team'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.playersTable}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, styles.playerNameHeader]}>
                    Player
                  </Text>
                  <Text style={[styles.tableHeaderText, styles.pointsHeader]}>
                    Points (3 decimals)
                  </Text>
                </View>

                {team.players.map((player) => (
                  <View key={player.id} style={styles.playerRow}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <View style={styles.pointsInputContainer}>
                      <TextInput
                        style={styles.pointsInput}
                        value={editValues[player.id] || formatPoints(contestPoints[player.id] || 0)}
                        onChangeText={(value) => handlePointsChange(player.id, value)}
                        onEndEditing={(e) => handlePointsBlur(player.id, e.nativeEvent.text)}
                        keyboardType="numeric"
                        placeholder="0.000"
                        placeholderTextColor={theme.text.subtle}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Contest Selection Modal */}
      <Modal
        visible={showContestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Contest</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowContestModal(false)}
              >
                <Ionicons name="close" size={24} color={theme.text.main} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              
              {contestsLoading ? (
                <View style={styles.emptyModalContainer}>
                  <ActivityIndicator size="large" color={theme.accent.pink.primary} />
                  <Text style={styles.emptyModalText}>Loading contests...</Text>
                </View>
              ) : contests.length === 0 ? (
                <View style={styles.emptyModalContainer}>
                  <Ionicons name="trophy-outline" size={48} color={theme.text.subtle} />
                  <Text style={styles.emptyModalText}>No contests available</Text>
                  <Text style={styles.emptyModalSubtext}>
                    {error || 'Please create a contest first or check your connection.'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.saveButton, { marginTop: 16 }]}
                    onPress={() => {
                      setShowContestModal(false);
                      loadContests();
                    }}
                  >
                    <Ionicons name="refresh" size={16} color="white" />
                    <Text style={styles.saveButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Clear selection option */}
                  {selectedContestId && (
                    <TouchableOpacity
                      style={[styles.contestOption, { borderColor: theme.status.danger + '50' }]}
                      onPress={() => {
                        setSelectedContestId('');
                        setShowContestModal(false);
                      }}
                    >
                      <View style={styles.contestOptionContent}>
                        <Text style={[styles.contestOptionName, { color: theme.status.danger }]}>
                          Clear Selection
                        </Text>
                        <Text style={styles.contestOptionDetails}>
                          Remove current contest selection
                        </Text>
                      </View>
                      <Ionicons name="close" size={20} color={theme.status.danger} />
                    </TouchableOpacity>
                  )}
                  
                  {/* Contest options */}
                  {contests.map((contest) => (
                    <TouchableOpacity
                      key={contest.id}
                      style={[
                        styles.contestOption,
                        selectedContestId === contest.id && styles.selectedContestOption
                      ]}
                      onPress={() => {
                        setSelectedContestId(contest.id);
                        setShowContestModal(false);
                      }}
                    >
                      <View style={styles.contestOptionContent}>
                        <Text style={[
                          styles.contestOptionName,
                          selectedContestId === contest.id && styles.selectedContestOptionText
                        ]}>
                          {contest.name}
                        </Text>
                        <Text style={styles.contestOptionDetails}>
                          {contest.status} • {contest.contest_type} • {new Date(contest.start_at).toLocaleDateString()}
                        </Text>
                      </View>
                      {selectedContestId === contest.id && (
                        <Ionicons name="checkmark" size={20} color={theme.accent.pink.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}