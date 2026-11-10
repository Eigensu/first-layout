import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeContext } from '../../theme';
import { useAuthStore } from '../../core/store/authStore';
import { useUserProfile, userKeys } from '../../core/hooks/useUser';
import { userService } from '../../services/userService';
import { GlassButton } from '../ui/GlassButton';

/**
 * Blocking prompt for the one detail Google sign-in can't give us: a mobile
 * number. A Google ID token carries no phone number, so any account created
 * that way (and any older account that skipped the optional signup field)
 * lands here once, right after signing in.
 */
export const MobileNumberGate: React.FC = () => {
  const { theme } = useThemeContext();
  const { isAuthenticated, logout } = useAuthStore();
  const { data: user } = useUserProfile();
  const queryClient = useQueryClient();

  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  // Tournaments run their own backends and some predate this endpoint. A
  // server that can't accept the number is no reason to lock the user out of
  // the app — stand down for this launch and ask again next time.
  const needsMobile = isAuthenticated && !!user && !user.mobile && !unsupported;

  const handleSave = async () => {
    const digits = mobile.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setError('Enter a valid mobile number (10-15 digits)');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await userService.updateProfile({ mobile: mobile.trim() });
      queryClient.setQueryData(userKeys.profile(), updated);
      setMobile('');
    } catch (e: any) {
      if (e?.code === 'UNSUPPORTED') {
        console.warn('[MobileNumberGate]', e.message);
        setUnsupported(true);
        return;
      }
      setError(e?.message || 'Could not save your number. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!needsMobile) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: theme.bg.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.border.subtle,
            padding: 24,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: theme.accent.pink.primary + '22',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name="call" size={26} color={theme.accent.pink.primary} />
          </View>

          <Text
            style={{
              fontSize: 20,
              fontFamily: theme.fonts.bold,
              color: theme.text.main,
              marginBottom: 6,
            }}
          >
            Add your mobile number
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.text.muted,
              lineHeight: 20,
              marginBottom: 18,
            }}
          >
            We need it to verify your account and reach you about contests and
            prizes. It's a one-time step.
          </Text>

          <TextInput
            style={{
              backgroundColor: theme.bg.cardSoft,
              borderWidth: 1,
              borderColor: error ? theme.status.danger : theme.border.subtle,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: theme.text.main,
            }}
            placeholder="Mobile number"
            placeholderTextColor={theme.text.subtle}
            value={mobile}
            onChangeText={(t) => {
              setMobile(t);
              if (error) setError(null);
            }}
            keyboardType="phone-pad"
            autoFocus
            editable={!saving}
          />

          {error && (
            <Text style={{ color: theme.status.danger, fontSize: 13, marginTop: 8 }}>
              {error}
            </Text>
          )}

          <GlassButton
            title="Save & Continue"
            onPress={handleSave}
            disabled={saving}
            loading={saving}
            size="lg"
            fullWidth
            style={{ marginTop: 18 }}
          />

          {/* Escape hatch so a user who doesn't want to share it isn't stuck. */}
          <TouchableOpacity
            onPress={() => logout()}
            disabled={saving}
            style={{ alignItems: 'center', paddingVertical: 12, marginTop: 4 }}
          >
            <Text style={{ color: theme.text.subtle, fontSize: 14 }}>Sign out instead</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
