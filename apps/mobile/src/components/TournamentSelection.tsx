import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '../theme';
import { useTournamentStore } from '../core/store/tournamentStore';
import { tournamentService } from '../services/tournamentService';
import { Tournament } from '../types/tournament';

interface TournamentSelectionProps {
  onTournamentSelected: (tournament: Tournament) => void;
}

export const TournamentSelection: React.FC<TournamentSelectionProps> = ({
  onTournamentSelected,
}) => {
  const { theme, isDark } = useThemeContext();
  const { tournaments, setTournaments, setSelectedTournament } = useTournamentStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const tournaments = await tournamentService.getTournaments();
        setTournaments(tournaments);
      } catch (err) {
        setError('Failed to load tournaments');
        console.error('Error fetching tournaments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, []);

  const handleTournamentSelect = (tournament: Tournament) => {
    // Check if tournament is active based on status
    const isActive = tournament.status === 'LIVE' || tournament.status === 'UPCOMING';
    
    if (!isActive) {
      Alert.alert(
        'Tournament Unavailable',
        'This tournament is not currently active.'
      );
      return;
    }

    setSelectedTournament(tournament);
    onTournamentSelected(tournament);
  };

  const getStatusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'LIVE':
        return theme.status.success;
      case 'UPCOMING':
        return theme.accent.pink.primary;
      case 'COMPLETED':
        return theme.text.subtle;
      default:
        return theme.text.subtle;
    }
  };

  const getStatusIcon = (status: Tournament['status']) => {
    switch (status) {
      case 'LIVE':
        return 'radio-button-on';
      case 'UPCOMING':
        return 'time';
      case 'COMPLETED':
        return 'checkmark-circle';
      default:
        return 'help-circle';
    }
  };

  if (loading) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.bg.body,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ActivityIndicator size="large" color={theme.accent.pink.primary} />
        <Text style={{
          color: theme.text.main,
          fontSize: 16,
          marginTop: 16,
          fontWeight: '500',
        }}>
          Loading Tournaments...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: theme.bg.body,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <Ionicons
          name="warning"
          size={64}
          color={theme.status.warning}
          style={{ marginBottom: 16 }}
        />
        <Text style={{
          color: theme.text.main,
          fontSize: 18,
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: 8,
        }}>
          Unable to Load Tournaments
        </Text>
        <Text style={{
          color: theme.text.subtle,
          fontSize: 14,
          textAlign: 'center',
          marginBottom: 24,
        }}>
          {error}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setError(null);
            setLoading(true);
            // Retry loading tournaments
            tournamentService.getTournaments()
              .then(tournaments => setTournaments(tournaments))
              .catch(err => setError('Failed to load tournaments'))
              .finally(() => setLoading(false));
          }}
          style={{
            backgroundColor: theme.accent.pink.primary,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
          }}
        >
          <Text style={{
            color: 'white',
            fontSize: 16,
            fontWeight: '600',
          }}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor: theme.bg.body,
    }}>
      {/* Header */}
      <View style={{
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: theme.bg.elevated,
        borderBottomWidth: 1,
        borderBottomColor: theme.border.subtle,
      }}>
        <View style={{
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <Image 
            source={isDark ? require('../../assets/logo-light.png') : require('../../assets/logo-dark.png')} 
            style={{
              width: 120,
              height: 60,
              marginBottom: 16,
            }}
            resizeMode="contain"
          />
        </View>
        <Text style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: theme.text.main,
          textAlign: 'center',
          marginBottom: 8,
        }}>
          Select Tournament
        </Text>
        <Text style={{
          fontSize: 16,
          color: theme.text.subtle,
          textAlign: 'center',
        }}>
          Choose a tournament to participate in
        </Text>
      </View>

      {/* Tournament List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {tournaments
          .sort((a, b) => {
            // Sort order: LIVE > UPCOMING > COMPLETED
            const statusOrder = { 'LIVE': 0, 'UPCOMING': 1, 'COMPLETED': 2 };
            const orderA = statusOrder[a.status] ?? 3;
            const orderB = statusOrder[b.status] ?? 3;
            return orderA - orderB;
          })
          .map((tournament) => {
          const isActive = tournament.status === 'LIVE' || tournament.status === 'UPCOMING';
          
          return (
            <TouchableOpacity
              key={tournament.id}
              onPress={() => handleTournamentSelect(tournament)}
              style={{
                backgroundColor: theme.bg.elevated,
                borderRadius: 16,
                padding: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: isActive ? theme.border.subtle : theme.border.subtle,
                opacity: isActive ? 1 : 0.6,
              }}
              activeOpacity={0.7}
            >
              {/* Tournament Header */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: theme.text.main,
                    marginBottom: 4,
                  }}>
                    {tournament.title}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    color: theme.text.subtle,
                    lineHeight: 20,
                  }}>
                    {tournament.game_name.toUpperCase()}
                  </Text>
                </View>
                
                {/* Status Badge */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: getStatusColor(tournament.status) + '20',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginLeft: 12,
                }}>
                  <Ionicons
                    name={getStatusIcon(tournament.status)}
                    size={12}
                    color={getStatusColor(tournament.status)}
                  />
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: getStatusColor(tournament.status),
                    marginLeft: 4,
                  }}>
                    {tournament.status_display}
                  </Text>
                </View>
              </View>

              {/* Tournament Details */}
              {tournament.duration && (
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 12,
                      color: theme.text.subtle,
                      marginBottom: 2,
                    }}>
                      Duration
                    </Text>
                    <Text style={{
                      fontSize: 14,
                      color: theme.text.main,
                      fontWeight: '500',
                    }}>
                      {tournament.duration}
                    </Text>
                  </View>
                </View>
              )}

              {/* Registration Deadline */}
              {tournament.registration_closes && tournament.status === 'UPCOMING' && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}>
                  <Ionicons
                    name="calendar"
                    size={16}
                    color={theme.status.warning}
                  />
                  <Text style={{
                    fontSize: 14,
                    color: theme.status.warning,
                    marginLeft: 6,
                    fontWeight: '500',
                  }}>
                    {tournament.registration_closes}
                  </Text>
                </View>
              )}

              {/* Action Indicator */}
              {isActive && (
                <View style={{
                  position: 'absolute',
                  right: 20,
                  top: '50%',
                  transform: [{ translateY: -12 }],
                }}>
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={theme.accent.pink.primary}
                  />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};