import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StatusBar, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInRight, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  loadNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  dismissNotification,
  dismissNotifications,
  subscribeNotificationInbox,
  syncNotificationInboxFromBackend,
} from "../../services/notificationService";
import { captureAuthSession } from "../../services/authStorage";
import { colors, radius, shadows, typography } from "../../theme/tokens";

const NotifItem = ({ item, onPress, onDelete, index, selectionMode, selected, onToggle }) => (
  <Animated.View entering={FadeInRight.delay(index * 50).springify().damping(16)}>
    <TouchableOpacity
      className="rounded-[18px] p-[14px] flex-row gap-3 mb-2 overflow-hidden"
      style={!item.read
        ? { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.borderStrong, ...shadows.card }
        : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.card }
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
          colors={[item.iconBg ?? colors.primaryMuted, colors.borderStrong]}
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
            className="flex-1"
            style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.read && <View className="w-2 h-2 rounded-full bg-primary shrink-0" />}
        </View>
        <Text className="text-[13px] leading-[20px]" style={{ color: colors.secondaryText, fontWeight: "400", letterSpacing: 0 }} numberOfLines={2}>{item.body}</Text>
        <Text className="text-[12px] mt-[2px]" style={{ color: colors.textSoft, fontWeight: "400", lineHeight: 18, letterSpacing: 0 }}>{item.time}</Text>
      </View>
      {selectionMode ? (
        <TouchableOpacity
          className="w-9 h-9 rounded-xl items-center justify-center self-center"
          style={{ backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted }}
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={selected ? "ยกเลิกการเลือกการแจ้งเตือน" : "เลือกการแจ้งเตือน"}
        >
          <Ionicons
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={selected ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          className="w-9 h-9 rounded-xl items-center justify-center self-center"
          style={{ backgroundColor: colors.surfaceMuted }}
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="ลบการแจ้งเตือน"
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  </Animated.View>
);

export default function NotificationsScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const { top } = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

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
  const notificationIds = useMemo(() => notifications.map((item) => String(item.id)), [notifications]);
  const allSelected = notificationIds.length > 0 && selectedIds.length === notificationIds.length;

  useEffect(() => {
    const available = new Set(notificationIds);
    setSelectedIds((current) => current.filter((id) => available.has(String(id))));
  }, [notificationIds]);

  const toggleSelectionMode = () => {
    setSelectionMode((current) => {
      if (current) setSelectedIds([]);
      return !current;
    });
  };

  const toggleSelected = useCallback((id) => {
    const normalizedId = String(id);
    setSelectedIds((current) => current.includes(normalizedId)
      ? current.filter((value) => value !== normalizedId)
      : [...current, normalizedId]);
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : notificationIds);
  }, [allSelected, notificationIds]);

  const deleteNotification = useCallback(async (item) => {
    const session = await captureAuthSession();
    if (!session) return;
    Alert.alert(
      t("notifications.deleteTitle"),
      t("notifications.deleteConfirm"),
      [
        { text: t("notifications.deleteCancel"), style: "cancel" },
        {
          text: t("notifications.deleteAction"),
          style: "destructive",
          onPress: () => dismissNotification(item.id, session).catch(() => {
            Alert.alert(t("notifications.deleteFailedTitle"), t("notifications.deleteFailed"));
          }),
        },
      ],
    );
  }, [t]);

  const deleteSelectedNotifications = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const session = await captureAuthSession();
    if (!session) return;
    Alert.alert(
      t("notifications.deleteSelectedTitle"),
      t("notifications.deleteSelectedConfirm", { count: selectedIds.length }),
      [
        { text: t("notifications.deleteCancel"), style: "cancel" },
        {
          text: t("notifications.deleteAction"),
          style: "destructive",
          onPress: async () => {
            if (deleting) return;
            setDeleting(true);
            try {
              await dismissNotifications(selectedIds, session);
              setSelectedIds([]);
              setSelectionMode(false);
            } catch (_) {
              Alert.alert(t("notifications.deleteFailedTitle"), t("notifications.deleteFailed"));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [deleting, selectedIds, t]);
  const openNotification = (item) => {
    markNotificationRead(item.id);
    const announcementId = item.data?.announcement_id ?? item.data?.announcementId;
    if (item.data?.type === "announcement" && announcementId != null) {
      navigation.navigate("AnnouncementDetail", {
        announcementId,
        notificationId: item.id,
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
    <View className="flex-1" style={{ backgroundColor: colors.surfaceMuted }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <LinearGradient colors={[colors.primaryDark, colors.primaryLight]} style={{ paddingTop: top + 10, paddingBottom: 18, paddingHorizontal: 16 }}>
        <View className="flex-row items-center gap-[10px]">
          <TouchableOpacity
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center gap-2">
            <Text className="text-white text-[21px] font-bold" style={{ lineHeight: 29, letterSpacing: 0 }}>{t("notifications.title")}</Text>
            {unreadCount > 0 && (
              <View className="bg-red-500 rounded-full min-w-[22px] h-[22px] items-center justify-center px-[6px]">
            <Text className="text-white text-[12px] font-semibold" style={typography.numeric}>{unreadCount}</Text>
              </View>
            )}
          </View>
          {selectionMode ? (
            <TouchableOpacity
              className="rounded-full px-3 py-[5px]"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              onPress={toggleSelectionMode}
              accessibilityRole="button"
            >
              <Text className="text-white" style={{ ...typography.button, fontSize: 14, lineHeight: 20 }}>{t("notifications.cancelSelect")}</Text>
            </TouchableOpacity>
          ) : notifications.length > 0 ? (
            <View className="flex-row items-center gap-2">
              {unreadCount > 0 && (
                <TouchableOpacity
                  className="rounded-full px-2 py-[5px]"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  onPress={markAllRead}
                >
                  <Text className="text-white" style={{ ...typography.button, fontSize: 13, lineHeight: 20 }}>{t("notifications.markAllRead")}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                className="rounded-full px-2 py-[5px]"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                onPress={toggleSelectionMode}
                accessibilityRole="button"
              >
                <Text className="text-white" style={{ ...typography.button, fontSize: 13, lineHeight: 20 }}>{t("notifications.select")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="w-20" />
          )}
        </View>
      </LinearGradient>

      {selectionMode && (
        <View className="flex-row items-center justify-between px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity className="flex-row items-center gap-2" onPress={toggleSelectAll} accessibilityRole="button">
            <Ionicons name={allSelected ? "checkmark-circle" : "ellipse-outline"} size={22} color={colors.primary} />
            <Text style={{ ...typography.body, color: colors.primary, fontWeight: "600", fontSize: 14, lineHeight: 20 }}>
              {allSelected ? t("notifications.clearSelection") : t("notifications.selectAll")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-row items-center gap-2 rounded-full px-3 py-2"
            style={{ backgroundColor: selectedIds.length > 0 ? colors.primarySoft : colors.surfaceMuted, opacity: selectedIds.length > 0 ? 1 : 0.55 }}
            onPress={deleteSelectedNotifications}
            disabled={selectedIds.length === 0 || deleting}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={17} color={colors.primary} />
            <Text style={{ ...typography.body, color: colors.primary, fontWeight: "600", fontSize: 13, lineHeight: 18 }}>
              {deleting ? t("notifications.deleting") : t("notifications.deleteSelected")}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.springify()} className="flex-1 items-center justify-center gap-3">
            <View
              className="w-[90px] h-[90px] rounded-full bg-white items-center justify-center mb-1"
              style={{ borderWidth: 1, borderColor: colors.border, ...shadows.card }}
            >
              <Ionicons name="notifications-off-outline" size={44} color={colors.textSoft} />
            </View>
            <Text className="text-[18px] font-semibold" style={{ color: colors.text, lineHeight: 26, letterSpacing: 0 }}>{t("notifications.empty")}</Text>
            <Text className="text-[14px]" style={{ color: colors.textSoft, lineHeight: 21, fontWeight: "400", letterSpacing: 0 }}>{t("notifications.emptySub")}</Text>
          </Animated.View>
        }
        renderItem={({ item, index }) => {
          if (item.type === "label") {
            return (
              <Text className="text-[12px] uppercase mt-4 mb-2 ml-[2px]" style={{ color: colors.textMuted, lineHeight: 18, fontWeight: "600", letterSpacing: 0 }}>
                {item.text}
              </Text>
            );
          }
          return (
            <NotifItem
              item={item}
              onPress={() => (selectionMode ? toggleSelected(item.id) : openNotification(item))}
              onDelete={() => deleteNotification(item)}
              onToggle={() => toggleSelected(item.id)}
              selectionMode={selectionMode}
              selected={selectedIds.includes(String(item.id))}
              index={index}
            />
          );
        }}
      />
    </View>
  );
}
