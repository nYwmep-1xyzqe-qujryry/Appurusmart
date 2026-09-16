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
import { colors, radius, serviceColors, typography } from "../../theme/tokens";

const ITEM_ICONS = {
  beforeClass:   { icon: "alarm-outline",         iconBg: serviceColors.meeting.iconColor },
  holiday:       { icon: "calendar-clear-outline", iconBg: colors.warning },
  gradeDeadline: { icon: "document-text-outline",  iconBg: serviceColors.advisor.iconColor },
  announcement:  { icon: "megaphone-outline",      iconBg: colors.primary },
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
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-white/20 items-center justify-center" onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ ...typography.sectionTitle, color: colors.surface }}>{t("notif.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ ...typography.label, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: "uppercase" }}>{t("notif.section")}</Text>

        <View className="bg-white mx-4 overflow-hidden" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>
          {ITEMS.map((item, i) => (
            <View key={item.key} className="flex-row items-center gap-[14px] px-4 py-[14px]" style={i < ITEMS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: ITEM_ICONS[item.key].iconBg }}>
                <Ionicons name={ITEM_ICONS[item.key].icon} size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>{item.title}</Text>
                {!!item.sub && <Text style={{ ...typography.secondary, marginTop: 2 }}>{item.sub}</Text>}
              </View>
              <Switch value={settings[item.key]} onValueChange={() => toggle(item.key)} disabled={saving} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" ios_backgroundColor={colors.border} />
            </View>
          ))}
        </View>

        {permissionStatus !== "granted" && permissionStatus !== "unavailable" && (
          <View className="bg-white rounded-2xl mx-4 mt-4 p-4 border border-[#e0ebe4]">
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surfaceWarning }}>
                <Ionicons name="notifications-off-outline" size={20} color={colors.warning} />
              </View>
              <View className="flex-1">
              <Text style={{ ...typography.body, fontSize: 15, lineHeight: 22, fontWeight: "600" }}>{t("notif.permissionOff")}</Text>
              <Text style={{ ...typography.secondary, marginTop: 4 }}>{t("notif.permissionOffSub")}</Text>
              </View>
            </View>
            <TouchableOpacity
              className="mt-3 min-h-11 flex-row items-center justify-center gap-2 px-4"
              style={{ borderRadius: radius.md, backgroundColor: colors.primary }}
              onPress={openNotificationSystemSettings}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
              <Text style={{ ...typography.button, color: colors.surface, fontSize: 15 }}>{t("notif.openSettings")}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="flex-row items-start gap-2 mx-4 mt-4 p-[14px]" style={{ backgroundColor: colors.primaryMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text className="flex-1" style={typography.caption}>{t("notif.deviceNote")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
