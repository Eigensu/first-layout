import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Contest } from "../../../types/arena";
import { format, formatDistanceToNow } from "date-fns";
import { useThemeContext } from "../../../theme";
import { useImageUrl } from "../../../hooks/useApiEndpoint";
import { SurfaceCard } from "../../../components/ui/SurfaceCard";
import { GlassButton } from "../../../components/ui/GlassButton";

interface ContestCardProps {
  contest: Contest;
  onPress: () => void;
  compact?: boolean;
  isEnrolled?: boolean;
  enrolledTeamId?: string;
  /** When false, the action button prompts login instead of joining. */
  isAuthenticated?: boolean;
}

const getStatusConfig = (status: Contest["status"], theme: any) => {
  switch (status) {
    case "live":
      return { bg: theme.status.success, icon: "radio" as const, label: "LIVE" };
    case "ongoing":
      return { bg: theme.status.danger, icon: "play-circle" as const, label: "ONGOING" };
    case "completed":
      return { bg: theme.text.subtle, icon: "checkmark-circle" as const, label: "COMPLETED" };
    case "archived":
      return { bg: theme.text.muted, icon: "archive" as const, label: "ARCHIVED" };
    default:
      return {
        bg: theme.text.subtle,
        icon: "help-circle" as const,
        label: String(status).toUpperCase(),
      };
  }
};

export const ContestCard: React.FC<ContestCardProps> = ({
  contest,
  onPress,
  compact = false,
  isEnrolled = false,
  enrolledTeamId,
  isAuthenticated = true,
}) => {
  const { theme } = useThemeContext();
  const { buildImageUrl } = useImageUrl();
  const router = useRouter();
  const startDate = new Date(contest.start_at);
  const endDate = new Date(contest.end_at);
  const now = new Date();
  const statusConfig = getStatusConfig(contest.status, theme);

  const timeInfo =
    now < startDate
      ? `Starts ${formatDistanceToNow(startDate, { addSuffix: true })}`
      : now > endDate
        ? `Ended ${format(endDate, "MMM d, h:mm a")}`
        : `Ends ${formatDistanceToNow(endDate, { addSuffix: true })}`;

  // Pick the action by auth + enrollment state (mirrors the website cards).
  const actionLabel = !isAuthenticated
    ? "LOGIN TO JOIN"
    : isEnrolled
      ? "VIEW TEAM"
      : "JOIN";

  const handleActionButtonPress = () => {
    if (!isAuthenticated) {
      router.push(
        `/(auth)/login?next=${encodeURIComponent(`/contest/${contest.id}`)}` as any
      );
      return;
    }
    if (isEnrolled && enrolledTeamId) {
      router.push(`/team/${enrolledTeamId}` as any);
      return;
    }
    router.push(`/contest/${contest.id}` as any);
  };

  // The backend serves contest logos from its own host as a relative path
  // ("/api/contests/<id>/logo"), which <Image> can't resolve — point it at the
  // active tournament's API.
  const logoUri = contest.logo_url ? buildImageUrl(contest.logo_url) : null;

  const ContestLogo = ({ size }: { size: number }) => (
    <Image
      source={
        logoUri
          ? { uri: logoUri }
          : require("../../../../assets/contest-logo.png")
      }
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.bg.cardSoft,
      }}
      resizeMode="cover"
    />
  );

  const hairline = theme.border.subtle;

  if (compact) {
    return (
      <Pressable onPress={onPress}>
        <SurfaceCard padding={10}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.text.main,
                  marginBottom: 2,
                }}
              >
                {contest.name}
              </Text>
              <Text style={{ fontSize: 10, color: theme.text.muted }}>{timeInfo}</Text>
            </View>
            <ContestLogo size={40} />
          </View>
        </SurfaceCard>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <SurfaceCard padding={0}>
        {/* Top row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: 14,
          }}
        >
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text
              style={{
                fontSize: 16,
                fontFamily: theme.fonts.bold,
                color: theme.text.main,
                marginBottom: 4,
              }}
            >
              {contest.name}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.accent.pink.primary,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {timeInfo}
            </Text>
          </View>
          <ContestLogo size={56} />
        </View>

        {/* Action row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: hairline,
          }}
        >
          <View
            style={{
              backgroundColor: statusConfig.bg,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={statusConfig.icon}
              size={12}
              color="#ffffff"
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "bold" }}>
              {statusConfig.label}
            </Text>
          </View>

          <GlassButton
            title={actionLabel}
            onPress={handleActionButtonPress}
            size="sm"
            radius={20}
            textStyle={{ fontSize: 12, fontWeight: "bold" }}
          />
        </View>
      </SurfaceCard>
    </Pressable>
  );
};
