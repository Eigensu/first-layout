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
import { adminService, AdminPlayer, AdminPlayerCreate } from '../../src/services/adminService';
import { formatPoints } from '../../src/utils/points';

export default function AdminPlayers() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [form, setForm] = useState<AdminPlayerCreate>({
    name: '',
    team: '',
    points: 0,
    status: 'active',
    price: 0,
    slot: '',
    image_url: '',
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
    headerMain: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
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
    playerCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    playerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    playerName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      flex: 1,
    },
    playerTeam: {
      fontSize: 14,
      color: theme.text.subtle,
      marginBottom: 4,
    },
    playerStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
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
    playerActions: {
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
      maxHeight: '80%',
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

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const response = await adminService.players.list({ 
        page_size: 100,
        search: searchQuery || undefined,
      });
      setPlayers(response.players);
    } catch (error) {
      console.error('Failed to load players:', error);
      Alert.alert('Error', 'Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayers();
    setRefreshing(false);
  };

  const handleCreatePlayer = async () => {
    if (!form.name.trim() || !form.team.trim()) {
      Alert.alert('Validation Error', 'Name and Team are required');
      return;
    }

    try {
      setCreating(true);
      await adminService.players.create(form);
      setShowCreateModal(false);
      setForm({
        name: '',
        team: '',
        points: 0,
        status: 'active',
        price: 0,
        slot: '',
        image_url: '',
      });
      await loadPlayers();
      Alert.alert('Success', 'Player created successfully');
    } catch (error: any) {
      console.error('Failed to create player:', error);
      Alert.alert('Error', error?.message || 'Failed to create player');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePlayer = (player: AdminPlayer) => {
    Alert.alert(
      'Delete Player',
      `Are you sure you want to delete "${player.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.players.delete(player.id);
              await loadPlayers();
              Alert.alert('Success', 'Player deleted successfully');
            } catch (error: any) {
              console.error('Failed to delete player:', error);
              Alert.alert('Error', error?.message || 'Failed to delete player');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadPlayers();
  }, [searchQuery]);

  const filteredPlayers = players.filter(player =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    player.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <Text style={styles.title}>Players</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.createButtonText}>Add Player</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search players by name or team..."
            placeholderTextColor={theme.text.subtle}
          />
        </View>

        {loading && players.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>Loading players...</Text>
          </View>
        ) : filteredPlayers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No players found' : 'No players yet'}
            </Text>
          </View>
        ) : (
          filteredPlayers.map((player) => (
            <View key={player.id} style={styles.playerCard}>
              <View style={styles.playerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.playerTeam}>{player.team}</Text>
                </View>
              </View>

              <View style={styles.playerStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Points:</Text>
                  <Text style={styles.statValue}>{formatPoints(player.points)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Price:</Text>
                  <Text style={styles.statValue}>{player.price}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Status:</Text>
                  <Text style={styles.statValue}>{player.status}</Text>
                </View>
              </View>

              <View style={styles.playerActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeletePlayer(player)}
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

      {/* Create Player Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Player</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(text) => setForm({ ...form, name: text })}
                  placeholder="Enter player name"
                  placeholderTextColor={theme.text.subtle}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Team</Text>
                <TextInput
                  style={styles.input}
                  value={form.team}
                  onChangeText={(text) => setForm({ ...form, team: text })}
                  placeholder="Enter team name"
                  placeholderTextColor={theme.text.subtle}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Points</Text>
                <TextInput
                  style={styles.input}
                  value={form.points.toString()}
                  onChangeText={(text) => setForm({ ...form, points: parseFloat(text) || 0 })}
                  placeholder="Enter points"
                  placeholderTextColor={theme.text.subtle}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  value={form.price.toString()}
                  onChangeText={(text) => setForm({ ...form, price: parseFloat(text) || 0 })}
                  placeholder="Enter price"
                  placeholderTextColor={theme.text.subtle}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Slot</Text>
                <TextInput
                  style={styles.input}
                  value={form.slot}
                  onChangeText={(text) => setForm({ ...form, slot: text })}
                  placeholder="Enter slot"
                  placeholderTextColor={theme.text.subtle}
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
                  onPress={handleCreatePlayer}
                  disabled={creating}
                >
                  <Text style={[styles.modalButtonText, styles.primaryButtonText]}>
                    {creating ? 'Adding...' : 'Add Player'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}