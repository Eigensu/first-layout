import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useThemeContext } from "../../theme";
import { Player } from "../../types/arena";
import { GlassButton } from "../ui/GlassButton";

interface SelectedPlayersHeaderProps {
  players: Player[];
  selectedPlayerIds: Set<string>;
  totalRequired: number;
  captainId?: string;
  viceCaptainId?: string;
  onClearAll: () => void;
  onPlayerPress?: (player: Player) => void;
}

export const SelectedPlayersHeader: React.FC<SelectedPlayersHeaderProps> = ({
  players,
  selectedPlayerIds,
  totalRequired,
  captainId,
  viceCaptainId,
  onClearAll,
  onPlayerPress,
}) => {
  const { theme } = useThemeContext();

  // Get selected players
  const selectedPlayers = Array.from(selectedPlayerIds)
    .map((id) => players.find((p) => p.id === id))
    .filter((player): player is Player => player !== undefined);

  if (selectedPlayers.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        backgroundColor: theme.bg.card,
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.border.subtle,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.border.subtle + "50",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: theme.text.main,
            }}
          >
            Selected Players
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                backgroundColor: theme.accent.pink.primary + "20",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 7,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: theme.accent.pink.primary,
                }}
              >
                {selectedPlayers.length}/{totalRequired}
              </Text>
            </View>
            <GlassButton
              title="Clear All"
              onPress={onClearAll}
              variant="secondary"
              size="sm"
              textStyle={{ fontSize: 10 }}
            />
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          {selectedPlayers.map((player) => {
            const isCaptain = player.id === captainId;
            const isViceCaptain = player.id === viceCaptainId;

            return (
              <Pressable
                key={player.id}
                onPress={() => onPlayerPress?.(player)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: theme.accent.pink.primary + "15",
                  borderRadius: 16,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: theme.accent.pink.primary + "30",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: theme.text.main,
                  }}
                >
                  {player.name}
                </Text>
                {isCaptain && (
                  <View
                    style={{
                      backgroundColor: theme.status.warning,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "bold",
                        color: "#ffffff",
                      }}
                    >
                      C
                    </Text>
                  </View>
                )}
                {isViceCaptain && (
                  <View
                    style={{
                      backgroundColor: theme.accent.orange.primary,
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "bold",
                        color: "#ffffff",
                      }}
                    >
                      VC
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};
