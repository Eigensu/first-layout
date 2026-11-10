import React from 'react';
import { View, Text } from 'react-native';
import { LeaderboardEntry } from '../../../types/arena';
import { Ionicons } from '@expo/vector-icons';

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser?: boolean;
}

export const LeaderboardRow: React.FC<LeaderboardRowProps> = ({
  entry,
  isCurrentUser = false,
}) => {
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-500';
    if (rank === 2) return 'text-gray-400';
    if (rank === 3) return 'text-orange-600';
    return 'text-gray-600 dark:text-gray-400';
  };

  return (
    <View
      className={`flex-row items-center p-4 border-b border-gray-200 dark:border-gray-700 ${
        isCurrentUser ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <Text className={`text-lg font-bold w-12 ${getRankColor(entry.rank)}`}>
        #{entry.rank}
      </Text>

      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">
          {entry.displayName}
          {isCurrentUser && (
            <Text className="text-sm text-blue-600 dark:text-blue-400"> (You)</Text>
          )}
        </Text>
        <Text className="text-sm text-gray-600 dark:text-gray-400">
          {entry.teamName}
        </Text>
      </View>

      <View className="items-end">
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          {entry.points}
        </Text>
        {entry.rankChange !== null && entry.rankChange !== 0 && (
          <View className="flex-row items-center">
            <Ionicons
              name={entry.rankChange > 0 ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={entry.rankChange > 0 ? '#10b981' : '#ef4444'}
            />
            <Text
              className={`text-xs font-medium ml-1 ${
                entry.rankChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {Math.abs(entry.rankChange)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
