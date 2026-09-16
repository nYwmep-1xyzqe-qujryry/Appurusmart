import React, { useMemo } from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadows, typography } from "../../theme/tokens";

const FALLBACK_ITEM = {
  title: "",
  body: "",
  receivedAt: Date.now(),
  icon: "notifications-outline",
  iconColor: colors.primary,
  iconBg: colors.primaryMuted,
};

export default function NotificationDetail({ navigation, route }) {
  const { t, i18n } = useTranslation();
  const { top } = useSafeAreaInsets();
  const item = route.params?.notification ?? FALLBACK_ITEM;
  const receivedAt = useMemo(() => new Date(item.receivedAt), [item.receivedAt]);
  const formattedDate = receivedAt.toLocaleString(
    i18n.language === "th" ? "th-TH" : "en-US",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.surfaceMuted }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <LinearGradient
        colors={[colors.primaryDark, colors.primaryLight]}
        style={{ paddingTop: top + 10, paddingBottom: 18, paddingHorizontal: 16 }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            className="w-[38px] h-[38px] rounded-xl items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text className="flex-1 text-white" style={{ ...typography.pageTitle, color: colors.surface }}>
            {t("notifications.detailTitle")}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
      >
        <View className="bg-white p-5" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, ...shadows.card }}>
          <View className="flex-row items-center gap-3 mb-5">
            <View
              className="w-[52px] h-[52px] rounded-2xl items-center justify-center"
              style={{ backgroundColor: item.iconBg ?? colors.primaryMuted }}
            >
              <Ionicons
                name={item.icon ?? "notifications-outline"}
                size={25}
                color={item.iconColor ?? colors.primary}
              />
            </View>
            <Text className="flex-1" style={{ ...typography.caption, color: colors.textSoft }}>
              {formattedDate}
            </Text>
          </View>

          <Text className="mb-3" style={{ ...typography.pageTitle, color: colors.text }}>
            {item.title || t("notifications.defaultTitle")}
          </Text>
          <View className="h-px mb-4" style={{ backgroundColor: colors.border }} />
          <Text style={{ ...typography.body, color: colors.secondaryText }}>
            {item.body || t("notifications.emptySub")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
