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
import { adminService, Contest } from '../../../services/adminService';
import { formatPoints } from '../../../utils/points';

interface User {
  user_id: string;
  username: string;
  full_name: string;
  team_count: number;
}

interface UserTeam {
  team_id: string;
  team_name: string;
  total_points: number;
  created_at: string;
  enrolled?: boolean;
  enrollment_id?: string;
}

interface EnrollmentTabProps {
  contestId: string;
  contest: Contest;
}

export const EnrollmentTab: React.FC<EnrollmentTabProps> = ({ contestId, contest }) => {
  const { theme } = useThemeContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userTeams, setUserTeams] = useState<UserTeam[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  
  const [searchLoading, setSearchLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    section: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      marginBottom: 16,
    },
    searchContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: theme.text.main,
      backgroundColor: theme.bg.body,
    },
    searchButton: {
      backgroundColor: theme.accent.pink.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      justifyContent: 'center',
    },
    searchButtonText: {
      color: 'white',
      fontWeight: '600',
    },
    userList: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      overflow: 'hidden',
    },
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    lastUserItem: {
      borderBottomWidth: 0,
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text.main,
    },
    userMeta: {
      fontSize: 12,
      color: theme.text.muted,
      marginTop: 2,
    },
    selectButton: {
      backgroundColor: theme.accent.pink.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    selectButtonText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '600',
    },
    selectedUserInfo: {
      backgroundColor: theme.accent.pink.primary + '20',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    selectedUserText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.accent.pink.primary,
    },
    teamList: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      maxHeight: 300,
      overflow: 'hidden',
    },
    teamItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    lastTeamItem: {
      borderBottomWidth: 0,
    },
    teamInfo: {
      flex: 1,
    },
    teamName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text.main,
    },
    teamMeta: {
      fontSize: 12,
      color: theme.text.muted,
      marginTop: 2,
    },
    enrolledBadge: {
      backgroundColor: '#10B981',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    enrolledText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '600',
    },
    unenrollButton: {
      backgroundColor: '#EF4444',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    unenrollText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '600',
    },
    checkbox: {
      width: 20,
      height: 20,
      borderWidth: 2,
      borderColor: theme.border.subtle,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkedBox: {
      backgroundColor: theme.accent.pink.primary,
      borderColor: theme.accent.pink.primary,
    },
    enrollButton: {
      backgroundColor: theme.accent.pink.primary,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 16,
    },
    enrollButtonDisabled: {
      backgroundColor: theme.text.muted,
    },
    enrollButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 16,
      color: theme.text.muted,
      marginTop: 16,
      textAlign: 'center',
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 20,
    },
    loadingText: {
      fontSize: 14,
      color: theme.text.muted,
      marginTop: 8,
    },
    warningContainer: {
      backgroundColor: '#FEF3C7',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    warningText: {
      fontSize: 14,
      color: '#92400E',
      marginLeft: 8,
      flex: 1,
    },
  });

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a search query');
      return;
    }

    try {
      setSearchLoading(true);
      const response = await adminService.users.listUsersWithTeams({
        search: searchQuery.trim(),
        page_size: 20,
      });
      setUsers(response.users);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to search users');
    } finally {
      setSearchLoading(false);
    }
  };

  const loadUserTeams = async (user: User) => {
    try {
      setTeamsLoading(true);
      setSelectedUser(user);
      setSelectedTeams(new Set());
      
      const response = await adminService.users.getUserTeams(user.user_id, {
        contest_id: contestId,
        page_size: 100,
      });
      setUserTeams(response.teams);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load user teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const toggleTeamSelection = (teamId: string) => {
    const newSelection = new Set(selectedTeams);
    if (newSelection.has(teamId)) {
      newSelection.delete(teamId);
    } else {
      newSelection.add(teamId);
    }
    setSelectedTeams(newSelection);
  };

  const enrollSelectedTeams = async () => {
    if (selectedTeams.size === 0) {
      Alert.alert('Error', 'Please select at least one team to enroll');
      return;
    }

    try {
      setEnrolling(true);
      await adminService.contests.enrollTeams(contestId, {
        team_ids: Array.from(selectedTeams),
      });
      
      // Refresh user teams to show updated enrollment status
      if (selectedUser) {
        await loadUserTeams(selectedUser);
      }
      
      Alert.alert('Success', 'Teams enrolled successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to enroll teams');
    } finally {
      setEnrolling(false);
    }
  };

  const unenrollTeam = async (teamId: string, teamName: string) => {
    Alert.alert(
      'Unenroll Team',
      `Are you sure you want to unenroll "${teamName}" from this contest?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unenroll',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.contests.unenrollTeams(contestId, {
                team_ids: [teamId],
              });
              
              // Refresh user teams
              if (selectedUser) {
                await loadUserTeams(selectedUser);
              }
              
              Alert.alert('Success', 'Team unenrolled successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to unenroll team');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedUser) {
      await loadUserTeams(selectedUser);
    }
    setRefreshing(false);
  };

  const isEnrollmentBlocked = contest.status === 'ongoing';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Search Users */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search Users</Text>
        
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username or full name"
            placeholderTextColor={theme.text.muted}
            onSubmitEditing={searchUsers}
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={searchUsers}
            disabled={searchLoading}
          >
            <Text style={styles.searchButtonText}>
              {searchLoading ? 'Searching...' : 'Search'}
            </Text>
          </TouchableOpacity>
        </View>

        {users.length > 0 && (
          <View style={styles.userList}>
            {users.map((user, index) => (
              <TouchableOpacity
                key={user.user_id}
                style={[
                  styles.userItem,
                  index === users.length - 1 && styles.lastUserItem,
                ]}
                onPress={() => loadUserTeams(user)}
              >
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userMeta}>
                    @{user.username} • {user.team_count} teams
                  </Text>
                </View>
                <View style={styles.selectButton}>
                  <Text style={styles.selectButtonText}>Select</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* User Teams */}
      {selectedUser && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manage Team Enrollments</Text>
          
          {isEnrollmentBlocked && (
            <View style={styles.warningContainer}>
              <Ionicons name="warning" size={20} color="#92400E" />
              <Text style={styles.warningText}>
                Enrollment is blocked while contest is ongoing
              </Text>
            </View>
          )}
          
          <View style={styles.selectedUserInfo}>
            <Text style={styles.selectedUserText}>
              {selectedUser.full_name} (@{selectedUser.username})
            </Text>
          </View>

          {teamsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.accent.pink.primary} />
              <Text style={styles.loadingText}>Loading teams...</Text>
            </View>
          ) : userTeams.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={theme.text.muted} />
              <Text style={styles.emptyText}>No teams found for this user</Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.teamList} nestedScrollEnabled>
                {userTeams.map((team, index) => (
                  <View
                    key={team.team_id}
                    style={[
                      styles.teamItem,
                      index === userTeams.length - 1 && styles.lastTeamItem,
                    ]}
                  >
                    <View style={styles.teamInfo}>
                      <Text style={styles.teamName}>{team.team_name}</Text>
                      <Text style={styles.teamMeta}>
                        Points: {formatPoints(team.total_points)} • Created: {new Date(team.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {team.enrolled ? (
                      <TouchableOpacity
                        style={styles.unenrollButton}
                        onPress={() => unenrollTeam(team.team_id, team.team_name)}
                        disabled={isEnrollmentBlocked}
                      >
                        <Text style={styles.unenrollText}>
                          {isEnrollmentBlocked ? 'Enrolled' : 'Unenroll'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.checkbox,
                          selectedTeams.has(team.team_id) && styles.checkedBox,
                        ]}
                        onPress={() => toggleTeamSelection(team.team_id)}
                        disabled={isEnrollmentBlocked}
                      >
                        {selectedTeams.has(team.team_id) && (
                          <Ionicons name="checkmark" size={12} color="white" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>

              {!isEnrollmentBlocked && selectedTeams.size > 0 && (
                <TouchableOpacity
                  style={[
                    styles.enrollButton,
                    enrolling && styles.enrollButtonDisabled,
                  ]}
                  onPress={enrollSelectedTeams}
                  disabled={enrolling}
                >
                  <Text style={styles.enrollButtonText}>
                    {enrolling
                      ? 'Enrolling...'
                      : `Enroll ${selectedTeams.size} Team${selectedTeams.size > 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
};