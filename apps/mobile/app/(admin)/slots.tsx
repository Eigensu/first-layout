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
import { adminService, AdminSlot, AdminSlotCreate } from '../../src/services/adminService';

export default function AdminSlots() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [form, setForm] = useState<AdminSlotCreate>({
    code: '',
    name: '',
    min_select: 1,
    max_select: 1,
    description: '',
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
    slotCard: {
      backgroundColor: theme.bg.elevated,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    slotHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    slotName: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text.main,
      flex: 1,
    },
    slotCode: {
      fontSize: 14,
      color: theme.text.subtle,
      marginBottom: 4,
    },
    slotStats: {
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
    slotDescription: {
      fontSize: 14,
      color: theme.text.subtle,
      marginBottom: 8,
      lineHeight: 20,
    },
    slotActions: {
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
      backgroundColor: theme.bg.body,
    },
    formRow: {
      flexDirection: 'row',
      gap: 12,
    },
    formRowItem: {
      flex: 1,
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

  const loadSlots = async () => {
    try {
      setLoading(true);
      const response = await adminService.slots.list({ 
        page_size: 100,
        search: searchQuery || undefined,
      });
      setSlots(response.slots);
    } catch (error) {
      console.error('Failed to load slots:', error);
      Alert.alert('Error', 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSlots();
    setRefreshing(false);
  };

  const handleCreateSlot = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      Alert.alert('Validation Error', 'Code and Name are required');
      return;
    }

    if (form.min_select > form.max_select) {
      Alert.alert('Validation Error', 'Min select cannot be greater than max select');
      return;
    }

    try {
      setCreating(true);
      await adminService.slots.create(form);
      setShowCreateModal(false);
      setForm({
        code: '',
        name: '',
        min_select: 1,
        max_select: 1,
        description: '',
      });
      await loadSlots();
      Alert.alert('Success', 'Slot created successfully');
    } catch (error: any) {
      console.error('Failed to create slot:', error);
      Alert.alert('Error', error?.message || 'Failed to create slot');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSlot = (slot: AdminSlot) => {
    Alert.alert(
      'Delete Slot',
      `Are you sure you want to delete "${slot.name}"?${slot.player_count > 0 ? ` This will unassign ${slot.player_count} players.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.slots.delete(slot.id, slot.player_count > 0);
              await loadSlots();
              Alert.alert('Success', 'Slot deleted successfully');
            } catch (error: any) {
              console.error('Failed to delete slot:', error);
              Alert.alert('Error', error?.message || 'Failed to delete slot');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadSlots();
  }, [searchQuery]);

  const filteredSlots = slots.filter(slot =>
    slot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    slot.code.toLowerCase().includes(searchQuery.toLowerCase())
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
            <Text style={styles.title}>Slots</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.createButtonText}>Create Slot</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search slots by name or code..."
            placeholderTextColor={theme.text.subtle}
          />
        </View>

        {loading && slots.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="grid" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>Loading slots...</Text>
          </View>
        ) : filteredSlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="grid" size={48} color={theme.text.subtle} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No slots found' : 'No slots yet'}
            </Text>
          </View>
        ) : (
          filteredSlots.map((slot) => (
            <View key={slot.id} style={styles.slotCard}>
              <View style={styles.slotHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotName}>{slot.name}</Text>
                  <Text style={styles.slotCode}>{slot.code}</Text>
                </View>
              </View>

              {slot.description && (
                <Text style={styles.slotDescription}>{slot.description}</Text>
              )}

              <View style={styles.slotStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Min:</Text>
                  <Text style={styles.statValue}>{slot.min_select}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Max:</Text>
                  <Text style={styles.statValue}>{slot.max_select}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Players:</Text>
                  <Text style={styles.statValue}>{slot.player_count}</Text>
                </View>
              </View>

              <View style={styles.slotActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>View Players</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleDeleteSlot(slot)}
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

      {/* Create Slot Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Slot</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={styles.input}
                value={form.code}
                onChangeText={(text) => setForm({ ...form, code: text })}
                placeholder="Enter slot code"
                placeholderTextColor={theme.text.subtle}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
                placeholder="Enter slot name"
                placeholderTextColor={theme.text.subtle}
              />
            </View>

            <View style={styles.formRow}>
              <View style={styles.formRowItem}>
                <Text style={styles.label}>Min Select</Text>
                <TextInput
                  style={styles.input}
                  value={form.min_select.toString()}
                  onChangeText={(text) => setForm({ ...form, min_select: parseInt(text) || 1 })}
                  placeholder="Min"
                  placeholderTextColor={theme.text.subtle}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.formRowItem}>
                <Text style={styles.label}>Max Select</Text>
                <TextInput
                  style={styles.input}
                  value={form.max_select.toString()}
                  onChangeText={(text) => setForm({ ...form, max_select: parseInt(text) || 1 })}
                  placeholder="Max"
                  placeholderTextColor={theme.text.subtle}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Enter slot description"
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
                onPress={handleCreateSlot}
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