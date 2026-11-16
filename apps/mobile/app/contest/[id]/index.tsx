import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { arenaService } from '../../../src/services/arenaService';
import { arenaKeys } from '../../../src/features/arena/queryKeys';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../src/theme';
import { GlassScreen } from '../../../src/components/ui/GlassScreen';
import { GlassCard } from '../../../src/components/ui/GlassCard';
import { SurfaceCard } from '../../../src/components/ui/SurfaceCard';
import { GlassButton } from '../../../src/components/ui/GlassButton';
import { formatPoints } from '../../../src/utils/points';

export default function ContestDetailScreen() {
  const { theme } = useThemeContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: contest, isLoading: contestLoading } = useQuery({
    queryKey: arenaKeys.contest(id),
    queryFn: () => arenaService.getContest(id),
    enabled: !!id,
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: arenaKeys.enrollments(),
    queryFn: () => arenaService.getMyEnrollments(),
  });

  const { data: teams } = useQuery({
    queryKey: arenaKeys.teams(),
    queryFn: () => arenaService.getMyTeams({ limit: 100 }),
  });

  const hairline = theme.border.subtle;

  // Shared top bar so every state (loading / not found / loaded) looks the same.
  const Header = ({ title }: { title: string }) => (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <GlassCard padding={6} radius={12}>
          <Ionicons name="chevron-back" size={20} color={theme.text.main} />
        </GlassCard>
      </Pressable>
      <Text
        style={{
          fontSize: 16,
          fontFamily: theme.fonts.semiBold,
          color: theme.text.main,
        }}
      >
        {title}
      </Text>
      <View style={{ width: 44 }} />
    </View>
  );

  if (contestLoading || enrollmentsLoading) {
    return (
      <GlassScreen>
        <Header title="Contest Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.accent.pink.primary} />
          <Text style={{ marginTop: 16, color: theme.text.muted, fontSize: 16 }}>
            Loading contest details...
          </Text>
        </View>
      </GlassScreen>
    );
  }

  if (!contest) {
    return (
      <GlassScreen>
        <Header title="Contest Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <SurfaceCard padding={24} style={{ alignItems: 'center' }}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.text.subtle} />
            <Text style={{ color: theme.text.muted, fontSize: 16, marginTop: 8 }}>
              Contest not found
            </Text>
          </SurfaceCard>
        </View>
      </GlassScreen>
    );
  }

  const myEnrolledTeams =
    enrollments?.filter((e) => e.contest_id === id && e.status === 'active') || [];
  const enrolledTeamDetails =
    teams?.teams.filter((t) => myEnrolledTeams.some((e) => e.team_id === t.id)) || [];

  // Only allow team creation for live contests AND if user doesn't have a team yet
  const canCreateTeam = contest.status === 'live' && enrolledTeamDetails.length === 0;

  // Small labelled info row used inside the summary card.
  const InfoRow = ({
    icon,
    iconColor,
    iconBg,
    label,
    children,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBg: string;
    label: string;
    children: React.ReactNode;
  }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ backgroundColor: iconBg, padding: 8, borderRadius: 10, marginRight: 12 }}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: theme.text.subtle, marginBottom: 2 }}>
          {label}
        </Text>
        {children}
      </View>
    </View>
  );

  return (
    <GlassScreen>
      <Header title="Contest Details" />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <SurfaceCard padding={16}>
          <Text
            style={{
              fontSize: 20,
              fontFamily: theme.fonts.bold,
              color: theme.text.main,
              textAlign: 'center',
              lineHeight: 26,
              marginBottom: 16,
            }}
          >
            {contest.name}
          </Text>

          <View style={{ gap: 14 }}>
            <InfoRow
              icon="calendar-outline"
              iconColor={theme.accent.pink.primary}
              iconBg={theme.accent.pink.primary + '22'}
              label="Contest Period"
            >
              <Text style={{ fontSize: 12, color: theme.text.main, fontFamily: theme.fonts.semiBold }}>
                {format(new Date(contest.start_at), 'MMM d, yyyy h:mm a')}
              </Text>
              <Text style={{ fontSize: 12, color: theme.text.main, fontFamily: theme.fonts.semiBold }}>
                {format(new Date(contest.end_at), 'MMM d, yyyy h:mm a')}
              </Text>
            </InfoRow>

            <InfoRow
              icon="trophy-outline"
              iconColor={theme.accent.orange.primary}
              iconBg={theme.accent.orange.primary + '22'}
              label="Type"
            >
              <Text style={{ fontSize: 14, color: theme.text.main, fontFamily: theme.fonts.semiBold }}>
                {contest.contest_type === 'daily' ? 'Daily Contest' : 'Full Tournament'}
              </Text>
            </InfoRow>

            {contest.allowed_teams.length > 0 && (
              <InfoRow
                icon="people-outline"
                iconColor={theme.status.success}
                iconBg={theme.status.success + '22'}
                label="Participating Teams"
              >
                <Text style={{ fontSize: 14, color: theme.text.main, fontFamily: theme.fonts.semiBold }}>
                  {contest.allowed_teams.join(' • ')}
                </Text>
              </InfoRow>
            )}
          </View>
        </SurfaceCard>

        {/* My Teams Card */}
        <SurfaceCard padding={16} style={{ marginTop: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: theme.fonts.bold, color: theme.text.main }}>
              My Teams ({enrolledTeamDetails.length})
            </Text>
            {canCreateTeam && (
              <GlassButton
                title="Create Team"
                icon="add"
                iconPosition="left"
                onPress={() => router.push(`/contest/${id}/create-team`)}
                size="sm"
                textStyle={{ fontSize: 12 }}
              />
            )}
          </View>

          {enrolledTeamDetails.length === 0 ? (
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 24,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: hairline,
                borderStyle: 'dashed',
              }}
            >
              <Ionicons name="people-outline" size={36} color={theme.text.subtle} />
              <Text style={{ color: theme.text.muted, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                No teams enrolled yet
              </Text>
              <Text style={{ color: theme.text.subtle, fontSize: 12, marginTop: 2, textAlign: 'center' }}>
                {contest.status === 'live'
                  ? 'Create your team to get started'
                  : 'Team creation is closed for this contest'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {enrolledTeamDetails.map((team) => (
                <Pressable
                  key={team.id}
                  onPress={() => router.push(`/team/${team.id}` as any)}
                  style={{
                    backgroundColor: theme.bg.cardSoft,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: hairline,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: theme.fonts.semiBold,
                      color: theme.text.main,
                      marginBottom: 6,
                    }}
                  >
                    {team.team_name}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="people" size={14} color={theme.text.muted} />
                      <Text style={{ fontSize: 12, color: theme.text.muted, marginLeft: 4 }}>
                        {team.player_ids.length} players
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: theme.accent.pink.primary + '22',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: theme.fonts.semiBold, color: theme.accent.pink.deep }}>
                        {formatPoints(team.total_points)} pts
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </SurfaceCard>

        {/* Leaderboard CTA. Wrapped in a plain View for the top margin —
            margin passed through GlassButton's own `style` prop doesn't
            reliably apply (unexplained; see GlassButton.tsx). */}
        <View style={{ marginTop: 12 }}>
        <GlassButton
          onPress={() => router.push(`/contest/${id}/leaderboard`)}
          fullWidth
          radius={22}
        >
          <View style={{ alignItems: 'center', paddingVertical: 4, width: '100%' }}>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                padding: 12,
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <Ionicons name="bar-chart" size={24} color={theme.text.button} />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontFamily: theme.fonts.bold,
                color: theme.text.button,
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              View Leaderboard
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.text.button,
                opacity: 0.85,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              See how you rank against the best
            </Text>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.2)',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.text.button,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: 12,
                  marginRight: 6,
                }}
              >
                View Rankings
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.text.button} />
            </View>
          </View>
        </GlassButton>
        </View>
      </ScrollView>
    </GlassScreen>
  );
}
