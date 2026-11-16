import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemeContext } from '../../theme';
import { SurfaceCard } from '../ui/SurfaceCard';
import { GlassButton } from '../ui/GlassButton';
import { useMyPerformance, ParticipationEntry } from '../../hooks/useMyPerformance';

const StatTile: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  onPress: () => void;
}> = ({ icon, value, label, onPress }) => {
  const { theme } = useThemeContext();

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <SurfaceCard style={{ flex: 1 }} padding={14}>
        <Ionicons name={icon} size={18} color={theme.accent.pink.primary} />
        <Text
          style={{
            fontSize: 24,
            fontFamily: theme.fonts.bold,
            color: theme.text.main,
            marginTop: 8,
          }}
        >
          {value}
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.subtle }}>{label}</Text>
      </SurfaceCard>
    </Pressable>
  );
};

const ContestRow: React.FC<{ entry: ParticipationEntry; onPress: () => void }> = ({
  entry,
  onPress,
}) => {
  const { theme } = useThemeContext();
  const isPodium = entry.rank !== null && entry.rank <= 3;

  return (
    <Pressable onPress={onPress} style={{ marginBottom: 10 }}>
      <SurfaceCard padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.semiBold,
                color: theme.text.main,
                marginBottom: 3,
              }}
            >
              {entry.contestName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="people" size={12} color={theme.text.subtle} />
              <Text
                numberOfLines={1}
                style={{ fontSize: 12, color: theme.text.subtle, marginLeft: 5 }}
              >
                {entry.teamName} · {entry.points} pts
              </Text>
            </View>
          </View>

          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 58,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: isPodium
                ? theme.accent.pink.primary
                : theme.bg.chip,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontFamily: theme.fonts.bold,
                color: isPodium ? theme.text.button : theme.text.main,
              }}
            >
              {entry.rank !== null ? `#${entry.rank}` : '—'}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: isPodium ? theme.text.button : theme.text.subtle,
              }}
            >
              rank
            </Text>
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
};

/**
 * Post-login home summary: how many contests the user is in, the best rank any
 * of their teams holds, how many teams they've built — then the contests
 * themselves with the rank for each.
 */
export const PerformanceWidgets: React.FC = () => {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { entries, contestsJoined, teamsCount, bestRank, isLoading } =
    useMyPerformance();

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color={theme.accent.pink.primary} />
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 12 }}>
      <Text
        style={{
          fontSize: 20,
          fontFamily: theme.fonts.bold,
          color: theme.text.main,
          marginBottom: 12,
        }}
      >
        Your Season
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <StatTile
          icon="trophy-outline"
          value={String(contestsJoined)}
          label={contestsJoined === 1 ? 'Contest joined' : 'Contests joined'}
          onPress={() => router.push('/(tabs)/contests')}
        />
        <StatTile
          icon="podium-outline"
          value={bestRank !== null ? `#${bestRank}` : '—'}
          label="Best rank"
          onPress={() => router.push('/leaderboard')}
        />
        <StatTile
          icon="people-outline"
          value={String(teamsCount)}
          label={teamsCount === 1 ? 'Team' : 'Teams'}
          onPress={() => router.push('/(tabs)/my-teams')}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontFamily: theme.fonts.bold,
            color: theme.text.main,
          }}
        >
          Your Contests
        </Text>
        {entries.length > 0 && (
          <Pressable
            onPress={() => router.push('/(tabs)/my-teams')}
            style={{ flexDirection: 'row', alignItems: 'center' }}
            hitSlop={8}
          >
            <Text
              style={{
                color: theme.accent.pink.primary,
                fontFamily: theme.fonts.semiBold,
                marginRight: 2,
              }}
            >
              My Teams
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.accent.pink.primary}
            />
          </Pressable>
        )}
      </View>

      {entries.length > 0 ? (
        entries.map((entry) => (
          <ContestRow
            key={`${entry.contestId}-${entry.teamId}`}
            entry={entry}
            onPress={() => router.push(`/contest/${entry.contestId}` as any)}
          />
        ))
      ) : (
        <SurfaceCard padding={20}>
          <View style={{ alignItems: 'center' }}>
            <Ionicons name="flag-outline" size={36} color={theme.text.subtle} />
            <Text
              style={{
                color: theme.text.main,
                fontFamily: theme.fonts.semiBold,
                fontSize: 16,
                marginTop: 10,
                marginBottom: 4,
              }}
            >
              No contests yet
            </Text>
            <Text
              style={{
                color: theme.text.muted,
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              Join a contest, build a team, and your rank shows up here.
            </Text>
            <GlassButton
              title="Browse Contests"
              onPress={() => router.push('/(tabs)/contests')}
            />
          </View>
        </SurfaceCard>
      )}
    </View>
  );
};
