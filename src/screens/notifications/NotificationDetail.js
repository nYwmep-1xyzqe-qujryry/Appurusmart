import React, { useMemo } from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FALLBACK_ITEM = {
  title: "",
  body: "",
  receivedAt: Date.now(),
  icon: "notifications-outline",
  iconColor: "#0f7a55",
  iconBg: "#e8f5ee",
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
    <View className="flex-1 bg-[#f0f6f2]">
      <StatusBar barStyle="light-content" backgroundColor="#064e35" />
      <LinearGradient
        colors={["#064e35", "#0a6644"]}
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
          <Text className="flex-1 text-white text-[20px] font-extrabold">
            {t("notifications.detailTitle")}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
      >
        <View className="bg-white rounded-[20px] p-5 border border-[#dce8e2]" style={{ elevation: 2 }}>
          <View className="flex-row items-center gap-3 mb-5">
            <View
              className="w-[52px] h-[52px] rounded-2xl items-center justify-center"
              style={{ backgroundColor: item.iconBg ?? "#e8f5ee" }}
            >
              <Ionicons
                name={item.icon ?? "notifications-outline"}
                size={25}
                color={item.iconColor ?? "#0f7a55"}
              />
            </View>
            <Text className="flex-1 text-[12px] font-semibold text-[#8fa89f]">
              {formattedDate}
            </Text>
          </View>

          <Text className="text-[21px] leading-[29px] font-extrabold text-[#0d1f18] mb-3">
            {item.title || t("notifications.defaultTitle")}
          </Text>
          <View className="h-px bg-[#e5eee9] mb-4" />
          <Text className="text-[15px] leading-[25px] text-[#33483f]">
            {item.body || t("notifications.emptySub")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
