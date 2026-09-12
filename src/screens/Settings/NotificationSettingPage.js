import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, ScrollView, StatusBar, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationPermissionStatus,
  loadNotificationSettings,
  openNotificationSystemSettings,
  ensurePushTokenRegistered,
  saveNotificationSettings,
  syncNotificationSettingsToBackend,
} from "../../services/notificationService";
import { captureAuthSession } from "../../services/authStorage";

const ITEM_ICONS = {
  beforeClass:   { icon: "alarm-outline",         iconBg: "#2167b2" },
  holiday:       { icon: "calendar-clear-outline", iconBg: "#c95b05" },
  gradeDeadline: { icon: "document-text-outline",  iconBg: "#7c3aed" },
  announcement:  { icon: "megaphone-outline",      iconBg: "#1a6b3c" },
};

export default function NotificationSettingPage() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [permissionStatus, setPermissionStatus] = useState("unavailable");
  const [saving, setSaving] = useState(false);
  const previousPermissionStatus = useRef(null);

  const refreshPermission = useCallback(async () => {
    try {
      const status = await getNotificationPermissionStatus();
      setPermissionStatus(status);
      const wasGranted = previousPermissionStatus.current === "granted";
      previousPermissionStatus.current = status;
      if (status === "granted" && !wasGranted) {
        const session = await captureAuthSession();
        if (session) await ensurePushTokenRegistered(session);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadNotificationSettings().then(setSettings).catch(() => {});
    refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const toggle = async (key) => {
    if (saving) return;
    const previous = settings;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSaving(true);
    let session = null;
    try {
      session = await captureAuthSession();
      if (!session) throw new Error("Missing authentication session");
      await saveNotificationSettings(next, session);
      const synced = await syncNotificationSettingsToBackend(next, session);
      if (!synced) throw new Error("Notification settings sync failed");
    } catch (_) {
      setSettings(previous);
      if (session) await saveNotificationSettings(previous, session).catch(() => {});
      Alert.alert(t("notif.saveFailedTitle"), t("notif.saveFailedMessage"));
    } finally {
      setSaving(false);
    }
  };

  const ITEMS = useMemo(() => [
    { key: "beforeClass",   title: t("notif.beforeClass"),   sub: t("notif.beforeClassSub") },
    { key: "holiday",       title: t("notif.holiday"),       sub: t("notif.holidaySub") },
    { key: "gradeDeadline", title: t("notif.gradeDeadline"), sub: t("notif.gradeDeadlineSub") },
    { key: "announcement",  title: t("notif.announcement"),  sub: "" },
  ], [t]);

  return (
    <View className="flex-1 bg-[#eaf5ef]">
      <StatusBar barStyle="light-content" backgroundColor="#0f7a55" />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-white/20 items-center justify-center" onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text className="text-[17px] font-extrabold text-white">{t("notif.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-[12px] font-bold text-[#4a5c54] px-5 pt-5 pb-2 uppercase tracking-[0.8px]">{t("notif.section")}</Text>

        <View className="bg-white rounded-2xl mx-4 overflow-hidden border border-[#e0ebe4]">
          {ITEMS.map((item, i) => (
            <View key={item.key} className={`flex-row items-center gap-[14px] px-4 py-[14px] ${i < ITEMS.length - 1 ? "border-b border-[#e0ebe4]" : ""}`}>
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: ITEM_ICONS[item.key].iconBg }}>
                <Ionicons name={ITEM_ICONS[item.key].icon} size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-[#101b17]">{item.title}</Text>
                {!!item.sub && <Text className="text-[12px] font-medium text-[#4a5c54] mt-[2px]">{item.sub}</Text>}
              </View>
              <Switch value={settings[item.key]} onValueChange={() => toggle(item.key)} disabled={saving} trackColor={{ false: "#dfe8e3", true: "#1a6b3c" }} thumbColor="#fff" ios_backgroundColor="#dfe8e3" />
            </View>
          ))}
        </View>

        {permissionStatus !== "granted" && permissionStatus !== "unavailable" && (
          <View className="bg-white rounded-2xl mx-4 mt-4 p-4 border border-[#e0ebe4]">
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 rounded-xl bg-[#fff4e0] items-center justify-center">
                <Ionicons name="notifications-off-outline" size={20} color="#a8631a" />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-bold text-[#101b17]">{t("notif.permissionOff")}</Text>
                <Text className="text-[12px] text-[#4a5c54] mt-1 leading-[18px]">{t("notif.permissionOffSub")}</Text>
              </View>
            </View>
            <TouchableOpacity
              className="mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#0f7a55] px-4"
              onPress={openNotificationSystemSettings}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
              <Text className="text-[14px] font-bold text-white">{t("notif.openSettings")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row items-start gap-2 bg-[#e8f5ee] rounded-[14px] mx-4 mt-4 p-[14px] border border-[#e0ebe4]">
          <Ionicons name="information-circle-outline" size={16} color="#1a6b3c" />
          <Text className="flex-1 text-[12px] text-[#4a5c54] leading-[18px]">{t("notif.deviceNote")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
