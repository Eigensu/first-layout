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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../src/theme';
import { adminService, Contest, ContestCreate } from '../../src/services/adminService';

export default function AdminContests() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [form, setForm] = useState<ContestCreate>({
    code: '',
    name: '',
    description: '',
    start_at: new Date().toISOString(),
    end_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: 'live',
    visibility: 'public',
    points_scope: 'time_window',
    contest_type: 'full',
    allowed_teams: [],
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg.body,
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      marginBottom: 20,
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
    headerMain: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: theme.text.main,
    },
    createButton: {
      backgroundColor: theme.accent.pink.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    createButtonText: {
      color: 'white',
      fontWeight: '600',
      marginLeft: 4,
    },
    contestCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    contestHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    contestName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      flex: 1,
    },
    contestCode: {
      fontSize: 14,
      color: theme.text.subtle,
      marginBottom: 4,
    },
    contestMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginRight: 8,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: 'white',
    },
    contestDates: {
      fontSize: 12,
      color: theme.text.subtle,
    },
    contestActions: {
      flexDirection: 'row',
      marginTop: 12,
      gap: 8,
    },
    actionButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    actionButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text.main,
    },
    deleteButton: {
      borderColor: '#EF4444',
    },
    deleteButtonText: {
      color: '#EF4444',
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
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 16,
      padding: 24,
      width: '90%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text.main,
      marginBottom: 20,
    },
    formGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: theme.text.main,
      backgroundColor: theme.bg.cardSoft,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 20,
    },
    modalButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    modalButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
    },
    primaryButton: {
      backgroundColor: theme.accent.pink.primary,
      borderColor: theme.accent.pink.primary,
    },
    primaryButtonText: {
      color: 'white',
    },
  });

  const loadContests = async () => {
    try {
      setLoading(true);
      const response = await adminService.contests.list({ page_size: 100 });
      setContests(response.contests);
    } catch (error) {
      console.error('Failed to load contests:', error);
      Alert.alert('Error', 'Failed to load contests');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContests();
    setRefreshing(false);
  };

  const handleCreateContest = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      Alert.alert('Validation Error', 'Code and Name are required');
      return;
    }

    try {
      setCreating(true);
      await adminService.contests.create(form);
      setShowCreateModal(false);
      setForm({
        code: '',
        name: '',
        description: '',
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'live',
        visibility: 'public',
        points_scope: 'time_window',
        contest_type: 'full',
        allowed_teams: [],
      });
      await loadContests();
      Alert.alert('Success', 'Contest created successfully');
    } catch (error: any) {
      console.error('Failed to create contest:', error);
      Alert.alert('Error', error?.message || 'Failed to create contest');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteContest = (contest: Contest) => {
    Alert.alert(
      'Delete Contest',
      `Are you sure you want to delete "${contest.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.contests.delete(contest.id);
              await loadContests();
              Alert.alert('Success', 'Contest deleted successfully');
            } catch (error: any) {
              console.error('Failed to delete contest:', error);
              Alert.alert('Error', error?.message || 'Failed to delete contest');
            }
          },
        },
      ]
    );
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
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    loadContests();
  }, []);

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
          <View style={styles.headerMain}>
            <Text style={styles.title}>Contests</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && contests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>Loading contests...</Text>
          </View>
        ) : contests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>No contests yet</Text>
          </View>
        ) : (
          contests.map((contest) => (
            <View key={contest.id} style={styles.contestCard}>
              <View style={styles.contestHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contestName}>{contest.name}</Text>
                  <Text style={styles.contestCode}>{contest.code}</Text>
                </View>
              </View>

              <View style={styles.contestMeta}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(contest.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{contest.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.contestDates}>
                  {formatDate(contest.start_at)} - {formatDate(contest.end_at)}
                </Text>
              </View>

              <View style={styles.contestActions}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => router.push(`/(admin)/contest/${contest.id}`)}
                >
                  <Text style={styles.actionButtonText}>Manage</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteContest(contest)}
                >
                  <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Contest Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Contest</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={styles.input}
                value={form.code}
                onChangeText={(text) => setForm({ ...form, code: text })}
                placeholder="Enter contest code"
                placeholderTextColor={theme.text.subtle}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
                placeholder="Enter contest name"
                placeholderTextColor={theme.text.subtle}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Enter contest description"
                placeholderTextColor={theme.text.subtle}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowCreateModal(false)}
                disabled={creating}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleCreateContest}
                disabled={creating}
              >
                <Text style={[styles.modalButtonText, styles.primaryButtonText]}>
                  {creating ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}