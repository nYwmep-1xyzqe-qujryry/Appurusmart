import React, { useRef, useMemo } from "react";
import { Animated, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import useCurrentUser from "../../hook/useCurrentUser";
import HeaderBar from "../../components/HeaderBar";
import { colors, radius, serviceColors, shadows, typography } from "../../theme/tokens";

const getMenu = (t) => [
  { label: t("settings.notification"), sub: t("settings.notificationSub"), icon: "notifications-outline", route: "NotificationSetting", color: colors.brandYellowDark, colorBg: colors.brandYellowSoft },
  { label: t("settings.language"),     sub: t("settings.languageSub"),     icon: "globe-outline",            route: "Language",            color: serviceColors.lms.iconColor, colorBg: serviceColors.lms.backgroundColor },
  { label: t("settings.security"),     sub: t("settings.securitySub"),     icon: "shield-checkmark-outline", route: "Security",            color: serviceColors.advisor.iconColor, colorBg: serviceColors.advisor.backgroundColor },
  { label: t("settings.contact"),      sub: t("settings.contactSub"),      icon: "call-outline",             route: "ContactUs",           color: colors.primary, colorBg: colors.primaryMuted },
];

const MenuRow = ({ item, isLast, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  const onPressIn = () => Animated.parallel([
    Animated.spring(scale, { toValue: 0.975, useNativeDriver: true, speed: 60 }),
    Animated.timing(bgAnim, { toValue: 1, useNativeDriver: false, duration: 80 }),
  ]).start();

  const onPressOut = () => Animated.parallel([
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 25 }),
    Animated.timing(bgAnim, { toValue: 0, useNativeDriver: false, duration: 200 }),
  ]).start();

  const bgColor = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.primarySoft] });

  return (
    <Animated.View style={[{ transform: [{ scale }] }, !isLast && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <Animated.View style={{ backgroundColor: bgColor }}>
        <TouchableOpacity
          className="flex-row items-center px-4 py-[14px] gap-[14px]"
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          <View className="w-[44px] h-[44px] items-center justify-center" style={{ backgroundColor: item.colorBg, borderRadius: radius.md }}>
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <View className="flex-1 gap-[3px]">
            <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>{item.label}</Text>
            {!!item.sub && <Text style={{ ...typography.secondary, marginTop: 1 }}>{item.sub}</Text>}
          </View>
          <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: colors.fieldBg }}>
            <Ionicons name="chevron-forward" size={14} color={colors.textSoft} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

export default function SettingPage() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user, logout } = useCurrentUser(navigation);
  const MENU = useMemo(() => getMenu(t), [t]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <HeaderBar
        name={user.name}
        photoUrl={user.photoUrl}
        onNotification={() => navigation.navigate("Notifications")}
        onLogout={logout}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 }}>
        {/* Menu card */}
        <View
          className="overflow-hidden"
          style={[{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }, shadows.card]}
        >
          {MENU.map((item, i) => (
            <MenuRow
              key={item.route}
              item={item}
              isLast={i === MENU.length - 1}
              onPress={() => navigation.navigate(item.route)}
            />
          ))}
        </View>

        {/* Logout button */}
        <TouchableOpacity
          onPress={logout}
          activeOpacity={0.8}
          className="flex-row items-center justify-center gap-3 py-[16px]"
          style={[{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderDanger }, shadows.card]}
        >
          <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceDanger }}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          </View>
          <Text style={{ ...typography.button, color: colors.danger }}>{t("settings.logout")}</Text>
        </TouchableOpacity>

        {/* App version */}
        <View className="items-center py-2">
          <Text style={typography.caption}>URUSmart v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
