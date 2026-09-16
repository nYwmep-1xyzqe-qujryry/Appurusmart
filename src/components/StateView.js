import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, hitSlop, radius, shadows, typography } from "../theme/tokens";

const StateView = ({
  type = "empty",
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}) => {
  const isLoading = type === "loading";
  const iconName =
    icon ??
    (isLoading
      ? "sync-outline"
      : type === "error"
        ? "cloud-offline-outline"
        : "folder-open-outline");

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: compact ? 18 : 28,
        paddingVertical: compact ? 22 : 34,
        gap: 10,
      }}
    >
      <View
        style={[
          {
            width: compact ? 58 : 76,
            height: compact ? 58 : 76,
            borderRadius: compact ? radius.lg : 38,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          },
          shadows.card,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator size={compact ? "small" : "large"} color={colors.primary} />
        ) : (
          <Ionicons
            name={iconName}
            size={compact ? 28 : 36}
            color={type === "error" ? colors.warning : colors.textSoft}
          />
        )}
      </View>
      {!!title && (
        <Text
          style={{
            fontSize: compact ? 14 : 16,
            lineHeight: compact ? 20 : 23,
            fontWeight: "700",
            color: colors.text,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
      {!!message && (
        <Text
          style={[
            typography.caption,
            {
              maxWidth: 280,
              textAlign: "center",
            },
          ]}
        >
          {message}
        </Text>
      )}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.82}
          hitSlop={hitSlop}
          style={{
            marginTop: 4,
            minHeight: 44,
            borderRadius: radius.md,
            paddingHorizontal: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: colors.surface, fontSize: 14, lineHeight: 20, fontWeight: "600", letterSpacing: 0 }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default StateView;
