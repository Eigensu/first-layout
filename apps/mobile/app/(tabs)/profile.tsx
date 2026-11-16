import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useUserProfile } from '../../src/core/hooks/useUser';
import { useAuth } from '../../src/core/hooks/useAuth';
import { useAuthStore } from '../../src/core/store/authStore';
import { useThemeContext } from '../../src/theme';
import { useMyPerformance } from '../../src/hooks/useMyPerformance';
import { ThemeDropdown } from '../../src/components/ui/ThemeDropdown';
import { TournamentSwitcher } from '../../src/components/TournamentSwitcher';
import { LoginRequired } from '../../src/components/auth/LoginRequired';
import { PlayerImage } from '../../src/components/PlayerImage';
import { GlassScreen } from '../../src/components/ui/GlassScreen';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SurfaceCard } from '../../src/components/ui/SurfaceCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { formatMobileForDisplay } from '../../src/utils/mobile';
import { getFreshAppleIdentityToken, getFreshGoogleIdToken } from '../../src/lib/socialReauth';
import type { DeleteAccountCredential } from '../../src/services/userService';

const AVATAR_SIZE = 88;
const AVATAR_RING = 4;
/** How far the avatar sits above the hero card it overlaps. */
const AVATAR_OVERHANG = (AVATAR_SIZE + AVATAR_RING * 2) / 2;

export default function ProfileScreen() {
  const { theme } = useThemeContext();
  const { isAuthenticated } = useAuthStore();
  const { data: user, isLoading: userLoading, error: userError } = useUserProfile();
  const { logout, deleteAccount } = useAuth();
  const { contestsJoined, bestRank, totalPoints } = useMyPerformance();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  // Accounts made with Google or Apple have no password, so they confirm with a
  // fresh sign-in from that provider instead. One that later set a password
  // through "forgot password" is asked for the password by the backend, so
  // that choice is theirs to make.
  const socialProvider =
    user?.authProvider === 'google' || user?.authProvider === 'apple' ? user.authProvider : null;
  const [usePasswordInstead, setUsePasswordInstead] = useState(false);
  const needsPassword = !socialProvider || usePasswordInstead;
  const providerName = socialProvider === 'apple' ? 'Apple' : 'Google';
  const [headerHeight, setHeaderHeight] = useState(96);

  const handleLogout = () => {
    logout();
    Alert.alert('Success', 'Logged out successfully');
  };

  const handleDeleteAccount = async () => {
    if (needsPassword && !deletePassword) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              let credential: DeleteAccountCredential;
              if (needsPassword) {
                credential = { password: deletePassword };
              } else {
                // A fresh sign-in, so a session left unattended can't delete
                // the account on its own. Dismissing the sheet cancels.
                const token =
                  socialProvider === 'apple'
                    ? await getFreshAppleIdentityToken()
                    : await getFreshGoogleIdToken();
                if (!token) return;
                credential =
                  socialProvider === 'apple'
                    ? { appleIdentityToken: token }
                    : { googleIdToken: token };
              }
              await deleteAccount(credential, deleteReason || undefined);
              setShowDeleteModal(false);
              Alert.alert('Success', 'Your account has been deleted');
            } catch (error: any) {
              let errorMessage = 'Failed to delete account. Please try again.';
              const status = error?.response?.status || error?.status;
              if (status === 401) {
                errorMessage = error?.message || 'Incorrect password';
              } else if (status === 403) {
                errorMessage = 'Account is already deactivated';
              } else if (status === 404) {
                errorMessage = 'Account not found';
              } else if (error?.response?.data?.detail) {
                errorMessage = error.response.data.detail;
              } else if (error?.message && !error.message.includes('status code')) {
                errorMessage = error.message;
              }
              Alert.alert('Error', errorMessage);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!isAuthenticated) {
    return (
      <LoginRequired
        title="Your profile"
        message="Log in to manage your account, tournaments, and preferences."
        icon="person-circle-outline"
      />
    );
  }

  if (userLoading) {
    return (
      <GlassScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={{ color: theme.text.muted, marginTop: 16 }}>Loading profile...</Text>
        </View>
      </GlassScreen>
    );
  }

  if (userError) {
    return (
      <GlassScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: theme.status.danger, fontSize: 20, fontFamily: theme.fonts.bold, marginBottom: 8 }}>
            Error Loading Profile
          </Text>
          <Text style={{ color: theme.text.muted, fontSize: 16, textAlign: 'center' }}>
            {userError instanceof Error ? userError.message : 'Unknown error'}
          </Text>
        </View>
      </GlassScreen>
    );
  }

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
    : null;

  /** Label-over-value column used in the hero card's stat row. */
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: theme.text.subtle, marginBottom: 6 }}>{label}</Text>
      <Text style={{ fontSize: 24, fontFamily: theme.fonts.bold, color: theme.text.main }}>
        {value}
      </Text>
    </View>
  );

  const StatDivider = () => (
    <View style={{ width: 1, height: 38, backgroundColor: theme.border.subtle }} />
  );

  /** Card title with an optional right-aligned action, as on the reference. */
  const CardHeader = ({
    title,
    actionLabel,
    onAction,
  }: {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: 17, fontFamily: theme.fonts.bold, color: theme.text.main }}>
        {title}
      </Text>
      {actionLabel && (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.semiBold,
              color: theme.accent.pink.primary,
              letterSpacing: 0.6,
            }}
          >
            {actionLabel.toUpperCase()}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const DetailRow = ({
    icon,
    label,
    value,
    first = false,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    first?: boolean;
  }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: first ? 0 : 12,
        marginTop: first ? 0 : 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.border.subtle,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: theme.accent.pink.primary + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon} size={18} color={theme.accent.pink.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label(theme)}>{label}</Text>
        <Text style={{ fontSize: 15, color: theme.text.main }}>{value}</Text>
      </View>
    </View>
  );

  return (
    <GlassScreen edges={[]}>
      <ScreenHeader title="Profile" onHeightChange={setHeaderHeight} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: headerHeight + 16,
          paddingBottom: 120,
        }}
      >
        {/* Hero: avatar straddling the top edge of the card, then name and stats */}
        <View style={{ marginBottom: 14 }}>
          <SurfaceCard style={{ marginTop: AVATAR_OVERHANG }} padding={0}>
            <View
              style={{
                paddingTop: AVATAR_OVERHANG + 14,
                paddingHorizontal: 16,
                paddingBottom: 18,
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontFamily: theme.fonts.bold,
                    color: theme.text.main,
                  }}
                >
                  {user?.name}
                </Text>
                {user?.isAdmin && (
                  <View
                    style={{
                      backgroundColor: theme.accent.pink.primary,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: 10,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: theme.fonts.semiBold,
                        color: theme.text.button,
                      }}
                    >
                      Admin
                    </Text>
                  </View>
                )}
              </View>

              {memberSince && (
                <Text style={{ fontSize: 13, color: theme.text.subtle, marginTop: 4 }}>
                  Member since {memberSince}
                </Text>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'stretch',
                  marginTop: 20,
                }}
              >
                <Stat label="Contests" value={String(contestsJoined)} />
                <StatDivider />
                <Stat label="Best rank" value={bestRank !== null ? `#${bestRank}` : '—'} />
                <StatDivider />
                <Stat label="Points" value={String(totalPoints)} />
              </View>
            </View>
          </SurfaceCard>

          {/* Positioned last so it paints above the card on both platforms. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
            <View
              style={{
                borderRadius: (AVATAR_SIZE + AVATAR_RING * 2) / 2,
                borderWidth: AVATAR_RING,
                borderColor: theme.bg.body,
                backgroundColor: theme.bg.body,
              }}
            >
              <PlayerImage
                imageUrl={user?.avatarUrl}
                playerName={user?.name}
                size={AVATAR_SIZE}
                fallbackIcon="person"
              />
            </View>
          </View>
        </View>

        {/* Account details */}
        <SurfaceCard padding={16} style={{ marginBottom: 12 }}>
          <CardHeader title="Account" />
          <DetailRow icon="mail-outline" label="Email" value={user?.email || '—'} first />
          <DetailRow
            icon="call-outline"
            label="Mobile"
            value={user?.mobile ? formatMobileForDisplay(user.mobile) : 'Not added yet'}
          />
          <DetailRow
            icon={
              user?.authProvider === 'google'
                ? 'logo-google'
                : user?.authProvider === 'apple'
                  ? 'logo-apple'
                  : 'key-outline'
            }
            label="Sign-in method"
            value={
              user?.authProvider === 'google'
                ? 'Google'
                : user?.authProvider === 'apple'
                  ? 'Apple'
                  : 'Email & password'
            }
          />
        </SurfaceCard>

        {/* Tournament */}
        <TournamentSwitcher />

        {/* Preferences */}
        <SurfaceCard padding={16} style={{ marginBottom: 12 }}>
          <CardHeader title="Preferences" />
          <ThemeDropdown />
        </SurfaceCard>

        {/* Session */}
        <SurfaceCard padding={16} style={{ marginBottom: 12 }}>
          <GlassButton
            title="Log out"
            icon="log-out-outline"
            iconPosition="left"
            variant="secondary"
            onPress={handleLogout}
            fullWidth
          />
        </SurfaceCard>

        {/* Danger Zone */}
        <SurfaceCard padding={16} style={{ marginBottom: 12 }}>
          <CardHeader title="Danger Zone" />
          <GlassButton
            title="Delete Account"
            icon="trash-outline"
            iconPosition="left"
            variant="danger"
            onPress={() => setShowDeleteModal(true)}
            fullWidth
          />
        </SurfaceCard>
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.bg.card }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={32} color={theme.status.danger} />
              <Text style={[styles.modalTitle, { color: theme.text.main }]}>Delete Account</Text>
            </View>

            <Text style={[styles.modalDescription, { color: theme.text.muted }]}>
              This action cannot be undone. Your account will be deactivated and you will lose access to all your data.
            </Text>

            {needsPassword ? (
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg.body, color: theme.text.main, borderColor: theme.border.subtle }]}
                placeholder="Enter your password"
                placeholderTextColor={theme.text.muted}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!isDeleting}
              />
            ) : (
              <>
                <Text style={[styles.modalDescription, { color: theme.text.main }]}>
                  {`You'll be asked to confirm with ${providerName} before your account is deleted.`}
                </Text>
                <TouchableOpacity onPress={() => setUsePasswordInstead(true)} disabled={isDeleting}>
                  <Text style={{ color: theme.text.muted, textAlign: 'center', marginBottom: 12 }}>
                    I set a password. Use it instead
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: theme.bg.body, color: theme.text.main, borderColor: theme.border.subtle }]}
              placeholder="Reason for leaving (optional)"
              placeholderTextColor={theme.text.muted}
              multiline
              numberOfLines={3}
              value={deleteReason}
              onChangeText={setDeleteReason}
              editable={!isDeleting}
            />

            <View style={styles.modalButtons}>
              <GlassButton
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteReason('');
                  setUsePasswordInstead(false);
                }}
                disabled={isDeleting}
                fullWidth
                style={{ flex: 1 }}
              />

              <GlassButton
                title="Delete"
                variant="danger"
                loading={isDeleting}
                onPress={handleDeleteAccount}
                disabled={isDeleting || (needsPassword && !deletePassword)}
                fullWidth
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </GlassScreen>
  );
}

const styles = {
  label: (theme: any) => ({
    fontSize: 12,
    marginBottom: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: theme.text.subtle,
  }),
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  modalContent: {
    width: '100%' as const,
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalHeader: {
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 12,
  },
  modalDescription: {
    fontSize: 14,
    textAlign: 'center' as const,
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top' as const,
  },
  modalButtons: {
    flexDirection: 'row' as const,
    marginTop: 8,
    gap: 12,
  },
};
