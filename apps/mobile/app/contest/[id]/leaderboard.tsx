import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../../../src/theme';
import { arenaService } from '../../../src/services/arenaService';
import { arenaKeys } from '../../../src/features/arena/queryKeys';
import { userService } from '../../../src/services/userService';
import { LeaderboardEntry } from '../../../src/types/arena';
import { TeamDetailsModal } from '../../../src/components/TeamDetailsModal';
import { Skeleton } from '../../../src/components/ui/Skeleton';
import { formatPoints } from '../../../src/utils/points';

export default function ContestLeaderboardScreen() {
  const { theme } = useThemeContext();
  const router = useRouter();
  const { id: contestId } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamModalVisible, setTeamModalVisible] = useState(false);

  // Fetch current user profile
  const { data: userProfile } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => userService.getProfile(),
    retry: false,
  });

  // Fetch contest details
  const { data: contest, isLoading: contestLoading, refetch: refetchContest } = useQuery({
    queryKey: arenaKeys.contest(contestId),
    queryFn: () => arenaService.getContest(contestId!),
    enabled: !!contestId,
  });

  // Fetch contest leaderboard
  const { data: leaderboard, isLoading: leaderboardLoading, refetch: refetchLeaderboard } = useQuery({
    queryKey: arenaKeys.contestLeaderboard(contestId),
    queryFn: () => arenaService.getContestLeaderboard(contestId!),
    enabled: !!contestId,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchContest(),
        refetchLeaderboard(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTeamPress = (teamId: string | null) => {
    if (!teamId) return;
    // Only allow viewing teams for ongoing or completed contests
    if (contest?.status === 'ongoing' || contest?.status === 'completed') {
      setSelectedTeamId(teamId);
      setTeamModalVisible(true);
    }
  };

  const closeTeamModal = () => {
    setTeamModalVisible(false);
    setSelectedTeamId(null);
  };

  const renderLeaderboardEntry = (entry: LeaderboardEntry, index: number) => {
    const isCurrentUser = userProfile && (entry.username === userProfile.email?.split('@')[0] || entry.displayName === userProfile.name);
    const canViewTeam = entry.teamId && (contest?.status === 'ongoing' || contest?.status === 'completed');
    
    const EntryWrapper = canViewTeam ? Pressable : View;
    
    return (
      <EntryWrapper
        key={`${entry.username}-${entry.rank}-${index}`}
        onPress={canViewTeam ? () => handleTeamPress(entry.teamId) : undefined}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: isCurrentUser ? theme.accent.pink.primary + '15' : theme.bg.card,
          marginHorizontal: 0,
          marginVertical: 0.5,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle + '40',
        }}
      >
        {/* Rank Badge */}
        <View style={{
          minWidth: 32,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}>
          <Text
            numberOfLines={1}
            style={{
              color: entry.rank <= 3 ? theme.accent.pink.primary : theme.text.main,
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            #{entry.rank}
          </Text>
        </View>
        
        {/* Player Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1 }}>
            <Text style={{ 
              fontSize: 14, 
              fontWeight: '600', 
              color: theme.text.main,
              marginRight: 4
            }}>
              {entry.displayName}
            </Text>
            {isCurrentUser && (
              <Text style={{
                color: theme.accent.pink.primary,
                fontSize: 12,
                fontWeight: '500'
              }}>
                (You)
              </Text>
            )}
          </View>
          <Text style={{ 
            fontSize: 12, 
            color: theme.text.muted,
          }}>
            {entry.teamName}
          </Text>
        </View>
        
        {/* Points */}
        <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: 'bold', 
            color: theme.text.main,
          }}>
            {formatPoints(entry.points).toLocaleString()}
          </Text>
          {canViewTeam && (
            <Ionicons name="chevron-forward" size={16} color={theme.text.subtle} />
          )}
        </View>
      </EntryWrapper>
    );
  };

  const renderLeaderboardSkeletonRow = (index: number) => (
    <View
      key={index}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginVertical: 0.5,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.border.subtle + '40',
      }}
    >
      <Skeleton width={28} height={16} radius={4} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={48} height={16} radius={4} />
    </View>
  );

  // Find current user's entry for "Your Rank" section
  const currentUserEntry = leaderboard?.entries?.find(entry => 
    userProfile && (entry.username === userProfile.email?.split('@')[0] || entry.displayName === userProfile.name)
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.body }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.bg.body,
        borderBottomWidth: 1,
        borderBottomColor: theme.border.subtle,
      }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: theme.bg.card,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Ionicons name="arrow-back" size={14} color={theme.text.main} />
        </Pressable>
        
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 12,
            color: theme.text.subtle,
            marginBottom: 1
          }}>
            Contest Details
          </Text>
          <Text style={{
            fontSize: 16,
            fontWeight: 'bold',
            color: theme.text.main,
          }}>
            Leaderboard
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent.pink.primary}
            colors={[theme.accent.pink.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Contest Info */}
        {contestLoading ? (
          <View style={{
            backgroundColor: theme.bg.card,
            marginHorizontal: 12,
            marginTop: 8,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border.subtle,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Skeleton width={16} height={16} radius={8} />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="35%" height={10} style={{ marginTop: 6 }} />
              </View>
            </View>
          </View>
        ) : contest && (
          <View style={{
            backgroundColor: theme.bg.card,
            marginHorizontal: 12,
            marginTop: 8,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.border.subtle,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons 
                name={contest.status === 'live' ? 'radio-button-on' : 'trophy-outline'} 
                size={16} 
                color={contest.status === 'live' ? theme.status.success : theme.accent.pink.primary} 
              />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: theme.text.main,
                  marginBottom: 2
                }}>
                  {contest.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    backgroundColor: contest.status === 'live' ? theme.status.success : 
                                    contest.status === 'completed' ? theme.text.subtle : theme.accent.orange.primary,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 4,
                    marginRight: 4
                  }}>
                    <Text style={{
                      color: 'white',
                      fontSize: 8,
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      {contest.status}
                    </Text>
                  </View>
                  <Text style={{
                    color: theme.text.subtle,
                    fontSize: 10,
                    fontWeight: '500'
                  }}>
                    {leaderboard?.entries?.length || 0} players
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Your Rank Section */}
        {currentUserEntry && (
          <View style={{
            marginHorizontal: 12,
            marginTop: 8,
          }}>
            <Text style={{
              fontSize: 10,
              fontWeight: '600',
              color: theme.text.subtle,
              marginBottom: 4,
              marginLeft: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}>
              Your Rank
            </Text>
            <View style={{
              backgroundColor: theme.bg.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.border.subtle,
              overflow: 'hidden'
            }}>
              {renderLeaderboardEntry(currentUserEntry, -1)}
            </View>
          </View>
        )}

        {/* Full Leaderboard */}
        <View style={{
          marginHorizontal: 12,
          marginTop: 12,
          marginBottom: 12,
          backgroundColor: theme.bg.card,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.border.subtle,
          overflow: 'hidden'
        }}>
          {leaderboardLoading ? (
            Array.from({ length: 10 }).map((_, index) => renderLeaderboardSkeletonRow(index))
          ) : leaderboard?.entries && leaderboard.entries.length > 0 ? (
            leaderboard.entries.map((entry, index) =>
              renderLeaderboardEntry(entry, index)
            )
          ) : (
            <View style={{
              alignItems: 'center',
              paddingVertical: 30,
              marginHorizontal: 12,
            }}>
              <Ionicons name="podium-outline" size={40} color={theme.text.subtle} />
              <Text style={{
                fontSize: 12,
                color: theme.text.subtle,
                marginTop: 8,
                textAlign: 'center'
              }}>
                No leaderboard data available
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Team Details Modal */}
      <TeamDetailsModal
        visible={teamModalVisible}
        contestId={contestId || null}
        teamId={selectedTeamId}
        onClose={closeTeamModal}
      />
    </SafeAreaView>
  );
}