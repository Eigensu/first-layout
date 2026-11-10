import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../theme';
import { adminService, Contest } from '../../../services/adminService';

interface ContestDetailsTabProps {
  contest: Contest;
  onUpdate: (contest: Contest) => void;
  onRefresh: () => void;
}

export const ContestDetailsTab: React.FC<ContestDetailsTabProps> = ({
  contest,
  onUpdate,
  onRefresh,
}) => {
  const { theme } = useThemeContext();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: contest.name,
    description: contest.description || '',
    status: contest.status,
    visibility: contest.visibility,
    contest_type: contest.contest_type,
    start_at: contest.start_at,
    end_at: contest.end_at,
    allowed_teams: (contest.allowed_teams || []).join(', '),
  });

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
    quickActions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border.subtle,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text.main,
      marginLeft: 8,
    },
    toggleButton: {
      backgroundColor: theme.accent.pink.primary,
      borderColor: theme.accent.pink.primary,
    },
    toggleButtonText: {
      color: 'white',
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
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    picker: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: 8,
      backgroundColor: theme.bg.body,
    },
    pickerItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    pickerItemText: {
      fontSize: 16,
      color: theme.text.main,
    },
    selectedPickerItem: {
      backgroundColor: theme.accent.pink.primary + '20',
    },
    selectedPickerItemText: {
      color: theme.accent.pink.primary,
      fontWeight: '600',
    },
    dateTimeContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    dateTimeInput: {
      flex: 1,
    },
    formActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    saveButton: {
      flex: 1,
      backgroundColor: theme.accent.pink.primary,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    saveButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: theme.text.main,
      fontSize: 16,
      fontWeight: '600',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border.subtle,
    },
    infoLabel: {
      fontSize: 14,
      color: theme.text.muted,
    },
    infoValue: {
      fontSize: 14,
      color: theme.text.main,
      fontWeight: '500',
    },
  });

  const toggleContestStatus = async () => {
    const newStatus = contest.status === 'ongoing' ? 'live' : 'ongoing';
    
    Alert.alert(
      'Toggle Contest Status',
      `Change status from "${contest.status}" to "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setToggling(true);
              const updated = await adminService.contests.update(contest.id, {
                status: newStatus,
              });
              onUpdate(updated);
              Alert.alert('Success', `Contest status changed to ${newStatus}`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update status');
            } finally {
              setToggling(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const updateData: any = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        visibility: form.visibility,
        contest_type: form.contest_type,
      };

      // Handle allowed teams for daily contests
      if (form.contest_type === 'daily') {
        updateData.allowed_teams = form.allowed_teams
          .split(',')
          .map(team => team.trim())
          .filter(team => team.length > 0);
      } else {
        updateData.allowed_teams = [];
      }

      const updated = await adminService.contests.update(contest.id, updateData);
      onUpdate(updated);
      setEditing(false);
      Alert.alert('Success', 'Contest updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update contest');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      name: contest.name,
      description: contest.description || '',
      status: contest.status,
      visibility: contest.visibility,
      contest_type: contest.contest_type,
      start_at: contest.start_at,
      end_at: contest.end_at,
      allowed_teams: (contest.allowed_teams || []).join(', '),
    });
    setEditing(false);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const StatusPicker = ({ value, onSelect }: { value: string; onSelect: (value: string) => void }) => {
    const options = [
      { value: 'live', label: 'Live' },
      { value: 'ongoing', label: 'Ongoing' },
      { value: 'completed', label: 'Completed' },
      { value: 'archived', label: 'Archived' },
    ];

    return (
      <View style={styles.picker}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerItem,
              value === option.value && styles.selectedPickerItem,
              index === options.length - 1 && { borderBottomWidth: 0 },
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.pickerItemText,
                value === option.value && styles.selectedPickerItemText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const VisibilityPicker = ({ value, onSelect }: { value: string; onSelect: (value: string) => void }) => {
    const options = [
      { value: 'public', label: 'Public' },
      { value: 'private', label: 'Private' },
    ];

    return (
      <View style={styles.picker}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerItem,
              value === option.value && styles.selectedPickerItem,
              index === options.length - 1 && { borderBottomWidth: 0 },
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.pickerItemText,
                value === option.value && styles.selectedPickerItemText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const ContestTypePicker = ({ value, onSelect }: { value: string; onSelect: (value: string) => void }) => {
    const options = [
      { value: 'full', label: 'Full Contest' },
      { value: 'daily', label: 'Daily Contest' },
    ];

    return (
      <View style={styles.picker}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerItem,
              value === option.value && styles.selectedPickerItem,
              index === options.length - 1 && { borderBottomWidth: 0 },
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.pickerItemText,
                value === option.value && styles.selectedPickerItemText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              contest.status === 'ongoing' ? styles.toggleButton : null,
            ]}
            onPress={toggleContestStatus}
            disabled={toggling}
          >
            <Ionicons
              name={contest.status === 'ongoing' ? 'pause' : 'play'}
              size={16}
              color={contest.status === 'ongoing' ? 'white' : theme.text.main}
            />
            <Text
              style={[
                styles.actionButtonText,
                contest.status === 'ongoing' ? styles.toggleButtonText : null,
              ]}
            >
              {toggling
                ? 'Updating...'
                : contest.status === 'ongoing'
                ? 'Set Live'
                : 'Set Ongoing'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setEditing(!editing)}
          >
            <Ionicons name="create-outline" size={16} color={theme.text.main} />
            <Text style={styles.actionButtonText}>
              {editing ? 'Cancel Edit' : 'Edit Details'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contest Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contest Information</Text>
        
        {editing ? (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
                placeholder="Contest name"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={(text) => setForm({ ...form, description: text })}
                placeholder="Contest description"
                placeholderTextColor={theme.text.muted}
                multiline
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Status</Text>
              <StatusPicker
                value={form.status}
                onSelect={(status) => setForm({ ...form, status: status as any })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Visibility</Text>
              <VisibilityPicker
                value={form.visibility}
                onSelect={(visibility) => setForm({ ...form, visibility: visibility as any })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Contest Type</Text>
              <ContestTypePicker
                value={form.contest_type}
                onSelect={(type) => setForm({ ...form, contest_type: type as any })}
              />
            </View>

            {form.contest_type === 'daily' && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Allowed Teams (comma separated)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.allowed_teams}
                  onChangeText={(text) => setForm({ ...form, allowed_teams: text })}
                  placeholder="e.g. Mumbai Indians, Chennai Super Kings"
                  placeholderTextColor={theme.text.muted}
                  multiline
                />
              </View>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{contest.name}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Code</Text>
              <Text style={styles.infoValue}>{contest.code}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{contest.status}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Visibility</Text>
              <Text style={styles.infoValue}>{contest.visibility}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{contest.contest_type}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Start Time</Text>
              <Text style={styles.infoValue}>{formatDateTime(contest.start_at)}</Text>
            </View>
            
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>End Time</Text>
              <Text style={styles.infoValue}>{formatDateTime(contest.end_at)}</Text>
            </View>

            {contest.description && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Description</Text>
                </View>
                <Text style={[styles.infoValue, { marginTop: 8 }]}>{contest.description}</Text>
              </>
            )}

            {contest.contest_type === 'daily' && contest.allowed_teams && contest.allowed_teams.length > 0 && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Allowed Teams</Text>
                </View>
                <Text style={[styles.infoValue, { marginTop: 8 }]}>
                  {contest.allowed_teams.join(', ')}
                </Text>
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
};