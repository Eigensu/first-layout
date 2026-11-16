import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "../../theme";
import { Player } from "../../types/arena";
import { formatPoints } from "../../utils/points";
import { PlayerCard } from "../../features/arena/molecules/PlayerCard";

interface ReplacePlayerModalProps {
  visible: boolean;
  onClose: () => void;
  targetPlayer: Player | null;
  candidates: Player[];
  onSelect: (playerId: string) => void;
}

export const ReplacePlayerModal: React.FC<ReplacePlayerModalProps> = ({
  visible,
  onClose,
  targetPlayer,
  candidates,
  onSelect,
}) => {
  const { theme } = useThemeContext();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCandidates = useMemo(() => {
    if (!searchQuery) return candidates;
    const q = searchQuery.toLowerCase();
    return candidates.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.team && p.team.toLowerCase().includes(q)),
    );
  }, [candidates, searchQuery]);

  if (!targetPlayer) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: theme.bg.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            height: "80%",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.border.subtle,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.text.main,
              }}
            >
              Replace Player
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.text.subtle} />
            </Pressable>
          </View>

          {/* Target Info */}
          <View
            style={{
              padding: 16,
              backgroundColor: theme.bg.elevated,
              borderBottomWidth: 1,
              borderBottomColor: theme.border.subtle,
            }}
          >
            <Text
              style={{ fontSize: 12, color: theme.text.muted, marginBottom: 4 }}
            >
              REPLACING
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.bg.card,
                  borderWidth: 1,
                  borderColor: theme.border.subtle,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: theme.text.main,
                  }}
                >
                  {targetPlayer.name.charAt(0)}
                </Text>
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.text.main,
                  }}
                >
                  {targetPlayer.name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.text.subtle }}>
                  {targetPlayer.team} • {formatPoints(targetPlayer.points)} pts
                </Text>
              </View>
            </View>
          </View>

          {/* Search */}
          <View style={{ padding: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.bg.elevated,
                borderRadius: 12,
                paddingHorizontal: 12,
                height: 44,
                borderWidth: 1,
                borderColor: theme.border.subtle,
              }}
            >
              <Ionicons name="search" size={20} color={theme.text.subtle} />
              <TextInput
                style={{
                  flex: 1,
                  marginLeft: 8,
                  fontSize: 16,
                  color: theme.text.main,
                }}
                placeholder="Search replacements..."
                placeholderTextColor={theme.text.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.text.subtle}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Candidate List */}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredCandidates.length > 0 ? (
              <View style={{ gap: 8 }}>
                {filteredCandidates.map((player) => (
                  <Pressable
                    key={player.id}
                    onPress={() => onSelect(player.id)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.7 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.bg.card,
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.border.subtle,
                    })}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.bg.elevated,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "bold",
                          color: theme.text.main,
                        }}
                      >
                        {player.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: theme.text.main,
                        }}
                      >
                        {player.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.text.subtle }}>
                        {player.team}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: theme.status.success,
                        }}
                      >
                        {formatPoints(player.points)} pts
                      </Text>
                    </View>
                    <Ionicons
                      name="swap-horizontal"
                      size={20}
                      color={theme.text.subtle}
                      style={{ marginLeft: 12 }}
                    />
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ alignItems: "center", padding: 20 }}>
                <Text style={{ color: theme.text.muted }}>
                  No valid replacements found.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
