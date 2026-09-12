import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInRight, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  loadNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotificationInbox,
  syncNotificationInboxFromBackend,
} from "../../services/notificationService";

const NotifItem = ({ item, onPress, index }) => (
  <Animated.View entering={FadeInRight.delay(index * 50).springify().damping(16)}>
    <TouchableOpacity
      className={`rounded-[18px] p-[14px] flex-row gap-3 mb-2 overflow-hidden ${item.read ? "bg-white border border-[#dce8e2]" : "border border-[#b2deca]"}`}
      style={!item.read
        ? { backgroundColor: "#f0faf5", elevation: 2, shadowColor: "#0f7a55", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }
        : { elevation: 1 }
      }
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Unread accent bar */}
      {!item.read && (
        <View className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[18px] bg-primary" />
      )}

      {/* Icon */}
      {!item.read ? (
        <LinearGradient
          colors={[item.iconBg ?? "#e8f5ee", "#d4efe5"]}
          style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <Ionicons name={item.icon} size={22} color={item.iconColor} />
        </LinearGradient>
      ) : (
        <View className="w-12 h-12 rounded-[14px] items-center justify-center shrink-0" style={{ backgroundColor: item.iconBg }}>
          <Ionicons name={item.icon} size={22} color={item.iconColor} />
        </View>
      )}

      {/* Text */}
      <View className="flex-1 gap-[3px] pl-1">
        <View className="flex-row items-center gap-[6px]">
          <Text
            className={`flex-1 text-[14px] text-[#0d1f18] ${item.read ? "font-semibold" : "font-extrabold"}`}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.read && <View className="w-2 h-2 rounded-full bg-primary shrink-0" />}
        </View>
        <Text className="text-[12px] text-[#4a5e56] leading-[18px]" numberOfLines={2}>{item.body}</Text>
        <Text className="text-[11px] text-[#8fa89f] font-semibold mt-[2px]">{item.time}</Text>
      </View>
    </TouchableOpacity>
  </Animated.View>
);

export default function NotificationsScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const { top } = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const refreshInbox = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      await syncNotificationInboxFromBackend();
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadNotificationInbox().then((items) => {
      if (active) setNotifications(items);
    });
    const unsubscribe = subscribeNotificationInbox(setNotifications);
    refreshInbox();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshInbox]);

  useEffect(
    () => navigation.addListener("focus", () => refreshInbox()),
    [navigation, refreshInbox],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = () => markAllNotificationsRead();
  const openNotification = (item) => {
    markNotificationRead(item.id);
    if (item.data?.type === "announcement") {
      navigation.navigate("Announcements", {
        highlightId: item.data.announcement_id,
      });
      return;
    }
    navigation.navigate("NotificationDetail", { notification: item });
  };

  const displayItems = useMemo(() => {
    const today = new Date();
    return notifications.map((item) => {
      const receivedAt = new Date(item.receivedAt);
      const isToday =
        receivedAt.getFullYear() === today.getFullYear() &&
        receivedAt.getMonth() === today.getMonth() &&
        receivedAt.getDate() === today.getDate();
      return {
        ...item,
        group: isToday ? "today" : "earlier",
        time: receivedAt.toLocaleString(
          i18n.language === "th" ? "th-TH" : "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
            ...(isToday
              ? {}
              : { day: "2-digit", month: "short", year: "numeric" }),
          },
        ),
      };
    });
  }, [i18n.language, notifications]);

  const todayItems   = displayItems.filter((n) => n.group === "today");
  const earlierItems = displayItems.filter((n) => n.group === "earlier");
  const sections = [
    ...(todayItems.length   > 0 ? [{ type: "label", id: "l-today",   text: t("notifications.today")   }, ...todayItems]   : []),
    ...(earlierItems.length > 0 ? [{ type: "label", id: "l-earlier", text: t("notifications.earlier") }, ...earlierItems] : []),
  ];

  return (
    <View className="flex-1 bg-[#f0f6f2]">
      <StatusBar barStyle="light-content" backgroundColor="#064e35" />

      {/* Header */}
      <LinearGradient colors={["#064e35", "#0a6644"]} style={{ paddingTop: top + 10, paddingBottom: 18, paddingHorizontal: 16 }}>
        <View className="flex-row items-center gap-[10px]">
          <TouchableOpacity
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center gap-2">
            <Text className="text-white text-[20px] font-extrabold tracking-[-0.3px]">{t("notifications.title")}</Text>
            {unreadCount > 0 && (
              <View className="bg-red-500 rounded-full min-w-[22px] h-[22px] items-center justify-center px-[6px]">
                <Text className="text-white text-[11px] font-extrabold">{unreadCount}</Text>
              </View>
            )}
          </View>
          {unreadCount > 0 ? (
            <TouchableOpacity
              className="rounded-full px-3 py-[5px]"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              onPress={markAllRead}
            >
              <Text className="text-white text-[12px] font-bold">{t("notifications.markAllRead")}</Text>
            </TouchableOpacity>
          ) : (
            <View className="w-20" />
          )}
        </View>
      </LinearGradient>

      {/* Body */}
      <FlatList
        data={sections}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: notifications.length === 0 ? 0 : 16,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refreshInbox(true)}
            tintColor="#0f7a55"
            colors={["#0f7a55"]}
          />
        }
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.springify()} className="flex-1 items-center justify-center gap-3">
            <View
              className="w-[90px] h-[90px] rounded-full bg-white border border-[#dce8e2] items-center justify-center mb-1"
              style={{ elevation: 2 }}
            >
              <Ionicons name="notifications-off-outline" size={44} color="#8fa89f" />
            </View>
            <Text className="text-[17px] font-extrabold text-[#0d1f18]">{t("notifications.empty")}</Text>
            <Text className="text-[13px] text-[#8fa89f] font-medium">{t("notifications.emptySub")}</Text>
          </Animated.View>
        }
        renderItem={({ item, index }) => {
          if (item.type === "label") {
            return (
              <Text className="text-[11px] font-extrabold text-[#8fa89f] tracking-[0.8px] uppercase mt-4 mb-2 ml-[2px]">
                {item.text}
              </Text>
            );
          }
          return <NotifItem item={item} onPress={() => openNotification(item)} index={index} />;
        }}
      />
    </View>
  );
}
