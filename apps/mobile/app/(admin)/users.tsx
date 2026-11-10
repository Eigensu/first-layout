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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/theme';
import { adminService, AdminUser, AdminUserTeam } from '../../src/services/adminService';
import { formatPoints } from '../../src/utils/points';

export default function AdminUsers() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userTeams, setUserTeams] = useState<AdminUserTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      marginBottom: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
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
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text.main,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.text.subtle,
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
    userCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    selectedUserCard: {
      borderColor: theme.accent.pink.primary,
      borderWidth: 2,
    },
    userHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
    },
    userUsername: {
      fontSize: 14,
      color: theme.text.subtle,
      marginTop: 2,
    },
    teamCount: {
      backgroundColor: theme.accent.pink.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      minWidth: 24,
      alignItems: 'center',
    },
    teamCountText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '600',
    },
    teamsSection: {
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      marginBottom: 12,
    },
    teamCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    teamName: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text.main,
      marginBottom: 4,
    },
    teamStats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statLabel: {
      fontSize: 12,
      color: theme.text.subtle,
      marginRight: 4,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
    enrolledBadge: {
      backgroundColor: '#10B981',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    enrolledText: {
      color: 'white',
      fontSize: 10,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      color: theme.text.subtle,
      marginTop: 16,
      textAlign: 'center',
    },
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await adminService.users.listUsersWithTeams({ 
        page_size: 100,
        search: searchQuery || undefined,
      });
      setUsers(response.users);
    } catch (error) {
      console.error('Failed to load users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadUserTeams = async (userId: string) => {
    try {
      setLoadingTeams(true);
      const response = await adminService.users.getUserTeams(userId, {
        page_size: 50,
      });
      setUserTeams(response.teams);
    } catch (error) {
      console.error('Failed to load user teams:', error);
      Alert.alert('Error', 'Failed to load user teams');
    } finally {
      setLoadingTeams(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedUser) {
      await loadUserTeams(selectedUser.user_id);
    } else {
      await loadUsers();
    }
    setRefreshing(false);
  };

  const handleUserSelect = async (user: AdminUser) => {
    setSelectedUser(user);
    await loadUserTeams(user.user_id);
  };

  const handleBackToUsers = () => {
    setSelectedUser(null);
    setUserTeams([]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  useEffect(() => {
    loadUsers();
  }, [searchQuery]);

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedUser) {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <TouchableOpacity style={styles.backButton} onPress={handleBackToUsers}>
            <Ionicons name="chevron-back" size={20} color={theme.accent.pink.primary} />
            <Text style={styles.backButtonText}>Back to Users</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{selectedUser.full_name}</Text>
            <Text style={styles.subtitle}>@{selectedUser.username}</Text>
          </View>

          <View style={styles.teamsSection}>
            <Text style={styles.sectionTitle}>
              Teams ({userTeams.length})
            </Text>

            {loadingTeams ? (
              <View style={styles.emptyState}>
                <Ionicons name="people" size={48} color={theme.text.subtle} />
                <Text style={styles.emptyText}>Loading teams...</Text>
              </View>
            ) : userTeams.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people" size={48} color={theme.text.subtle} />
                <Text style={styles.emptyText}>No teams found for this user</Text>
              </View>
            ) : (
              userTeams.map((team) => (
                <View key={team.team_id} style={styles.teamCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teamName}>{team.team_name}</Text>
                      <View style={styles.teamStats}>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Points:</Text>
                          <Text style={styles.statValue}>{formatPoints(team.total_points)}</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Created:</Text>
                          <Text style={styles.statValue}>{formatDate(team.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                    {team.enrolled && (
                      <View style={styles.enrolledBadge}>
                        <Text style={styles.enrolledText}>ENROLLED</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={20} color={theme.accent.pink.primary} />
              <Text style={styles.backButtonText}>Dashboard</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>Users & Teams</Text>
          <Text style={styles.subtitle}>
            Manage users and their team enrollments
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users by username or name..."
            placeholderTextColor={theme.text.subtle}
          />
        </View>

        {loading && users.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>Loading users...</Text>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No users found' : 'No users with teams found'}
            </Text>
          </View>
        ) : (
          filteredUsers.map((user) => (
            <TouchableOpacity
              key={user.user_id}
              style={styles.userCard}
              onPress={() => handleUserSelect(user)}
            >
              <View style={styles.userHeader}>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                </View>
                <View style={styles.teamCount}>
                  <Text style={styles.teamCountText}>{user.team_count}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}