import React, { useState } from 'react';
import { View, Text, Pressable, RefreshControl, FlatList, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../src/theme';
import { arenaService } from '../src/services/arenaService';
import { arenaKeys } from '../src/features/arena/queryKeys';
import { GlassScreen } from '../src/components/ui/GlassScreen';
import { GlassCard } from '../src/components/ui/GlassCard';
import { Skeleton } from '../src/components/ui/Skeleton';
import { formatPoints } from '../src/utils/points';
import { LeaderboardEntry, ContestStatus } from '../src/types/arena';

interface ContestLeaderboard {
  contestId: string;
  contestName: string;
  contestStatus: ContestStatus;
  entries: LeaderboardEntry[];
}

export default function LeaderboardScreen() {
  const { theme, isDark } = useThemeContext();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all contests
  const { data: contests, isLoading: contestsLoading, refetch: refetchContests } = useQuery({
    queryKey: arenaKeys.contestList({ pageSize: 50 }),
    queryFn: () => arenaService.getContests({ page: 1, page_size: 50 }),
  });

  // Fetch all contest leaderboards
  const { data: allLeaderboards, isLoading: leaderboardsLoading, refetch: refetchAllLeaderboards } = useQuery({
    queryKey: arenaKeys.allContestLeaderboards(),
    queryFn: async () => {
      if (!contests?.contests) return [];
      
      const leaderboards = await Promise.allSettled(
        contests.contests.map(async (contest) => {
          try {
            const leaderboard = await arenaService.getContestLeaderboard(contest.id);
            return {
              contestId: contest.id,
              contestName: contest.name,
              contestStatus: contest.status as ContestStatus,
              entries: leaderboard?.entries || []
            } as ContestLeaderboard;
          } catch (error) {
            console.warn(`Failed to fetch leaderboard for ${contest.name}:`, error);
            return {
              contestId: contest.id,
              contestName: contest.name,
              contestStatus: contest.status as ContestStatus,
              entries: []
            } as ContestLeaderboard;
          }
        })
      );

      return leaderboards
        .filter((result): result is PromiseFulfilledResult<ContestLeaderboard> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value)
        .filter(leaderboard => leaderboard.entries.length > 0);
    },
    enabled: !!contests,
  });

  const filteredLeaderboards = (allLeaderboards || []).filter((lb) =>
    lb.contestName.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchContests(), refetchAllLeaderboards()]);
    } finally {
      setRefreshing(false);
    }
  };

  const renderLeaderboardEntry = (entry: LeaderboardEntry, index: number) => (
    <View
      key={`${entry.username}-${entry.rank}-${index}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: entry.rank <= 3 ? theme.accent.pink.primary + '10' : theme.bg.cardSoft,
        marginHorizontal: 12,
        marginVertical: 2,
        borderRadius: 12,
        borderWidth: entry.rank <= 3 ? 1 : 0,
        borderColor: entry.rank <= 3 ? theme.accent.pink.primary + '30' : 'transparent',
      }}
    >
      {/* Rank Badge */}
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: entry.rank <= 3 ? theme.accent.pink.primary : theme.bg.body,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: entry.rank <= 3 ? 0 : 1,
        borderColor: theme.border.subtle,
      }}>
        {entry.rank <= 3 ? (
          <Ionicons
            name={entry.rank === 1 ? 'trophy' : entry.rank === 2 ? 'medal' : 'ribbon'}
            size={16}
            color="white"
          />
        ) : (
          <Text style={{
            color: theme.text.main,
            fontWeight: 'bold',
            fontSize: 12
          }}>
            {entry.rank}
          </Text>
        )}
      </View>
      
      {/* Player Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ 
          fontSize: 14, 
          fontWeight: '600', 
          color: theme.text.main,
          marginBottom: 2
        }}>
          {entry.displayName}
        </Text>
        <Text style={{ 
          fontSize: 12, 
          color: theme.text.subtle,
          marginBottom: 1
        }}>
          @{entry.username}
        </Text>
        <Text style={{ 
          fontSize: 12, 
          color: theme.text.muted,
          fontStyle: 'italic'
        }}>
          {entry.teamName}
        </Text>
      </View>
      
      {/* Points */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ 
          fontSize: 16, 
          fontWeight: 'bold', 
          color: theme.accent.pink.primary,
          marginBottom: 2
        }}>
          {formatPoints(entry.points).toLocaleString()}
        </Text>
        <Text style={{
          fontSize: 10, 
          color: theme.text.subtle 
        }}>
          points
        </Text>
      </View>
    </View>
  );

  const renderContestSkeletonCard = (index: number) => (
    <View
      key={index}
      style={{
        backgroundColor: theme.bg.card,
        marginHorizontal: 12,
        marginVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border.subtle,
        overflow: 'hidden',
      }}
    >
      <View style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.border.subtle,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Skeleton width={20} height={20} radius={10} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Skeleton width="50%" height={16} />
            <Skeleton width="30%" height={11} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>
      <View style={{ paddingVertical: 10 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              marginHorizontal: 12,
              marginVertical: 2,
            }}
          >
            <Skeleton width={32} height={32} radius={16} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="35%" height={11} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={40} height={16} radius={4} />
          </View>
        ))}
      </View>
    </View>
  );

  const renderContestLeaderboard = ({ item }: { item: ContestLeaderboard }) => (
    <Pressable
      onPress={() => {
        // Navigate to contest-specific leaderboard page
        router.push(`/contest/${item.contestId}/leaderboard` as any);
      }}
      style={{
        backgroundColor: theme.bg.card,
        marginHorizontal: 12,
        marginVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border.subtle,
        overflow: 'hidden'
      }}
    >
      {/* Contest Header */}
      <View style={{
        backgroundColor: theme.accent.pink.primary + '15',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.border.subtle,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons 
            name={item.contestStatus === 'live' ? 'radio-button-on' : 'trophy-outline'} 
            size={20} 
            color={item.contestStatus === 'live' ? theme.status.success : theme.accent.pink.primary} 
          />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: 'bold',
              color: theme.text.main,
              marginBottom: 2
            }}>
              {item.contestName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                backgroundColor: item.contestStatus === 'live' ? theme.status.success : 
                                item.contestStatus === 'completed' ? theme.text.subtle : theme.accent.orange.primary,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                marginRight: 6
              }}>
                <Text style={{
                  color: 'white',
                  fontSize: 9,
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>
                  {item.contestStatus}
                </Text>
              </View>
              <Text style={{
                color: theme.text.subtle,
                fontSize: 12,
                fontWeight: '500'
              }}>
                {item.entries.length} players
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.text.subtle} />
        </View>
      </View>

      {/* Top 3 Players */}
      <View style={{ paddingVertical: 6 }}>
        {item.entries.slice(0, 3).map((entry, index) => 
          renderLeaderboardEntry(entry, index)
        )}
        
        {item.entries.length > 3 && (
          <View style={{
            alignItems: 'center',
            paddingVertical: 8,
            marginHorizontal: 12,
            marginTop: 4,
            backgroundColor: theme.bg.cardSoft,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.border.subtle,
          }}>
            <Text style={{
              color: theme.accent.pink.primary,
              fontWeight: '600',
              fontSize: 12
            }}>
              +{item.entries.length - 3} more players • Tap to view all
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <GlassScreen>
      {/* Header */}
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
          Leaderboards
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isDark ? theme.bg.elevated : theme.bg.card,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.border.subtle,
          marginHorizontal: 16,
          marginBottom: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Ionicons name="search" size={18} color={theme.text.subtle} style={{ marginRight: 8 }} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search contests..."
          placeholderTextColor={theme.text.subtle}
          style={{ flex: 1, fontSize: 15, color: theme.text.main, paddingVertical: 0 }}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.text.subtle} />
          </Pressable>
        )}
      </View>

      {/* Contests */}
      {contestsLoading || leaderboardsLoading ? (
        <View style={{ flex: 1 }}>
          {[0, 1, 2].map((i) => renderContestSkeletonCard(i))}
        </View>
      ) : (
        <FlatList
          data={filteredLeaderboards}
          renderItem={renderContestLeaderboard}
          keyExtractor={(item) => item.contestId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.accent.pink.primary}
              colors={[theme.accent.pink.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={
            <View style={{
              alignItems: 'center',
              paddingVertical: 40,
              marginHorizontal: 12,
            }}>
              <Ionicons name="podium-outline" size={48} color={theme.text.subtle} />
              <Text style={{
                fontSize: 14,
                color: theme.text.subtle,
                marginTop: 12,
                textAlign: 'center'
              }}>
                {searchQuery ? 'No contests match your search' : 'No contest leaderboards available'}
              </Text>
            </View>
          }
        />
      )}
    </GlassScreen>
  );
}