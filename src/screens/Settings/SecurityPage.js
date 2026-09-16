import React, { useEffect, useState } from "react";
import { Alert, Image, Platform, ScrollView, StatusBar, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAuthToken } from "../../services/authStorage";
import {
  checkSupport,
  getBiometricPresentation,
  setBiometricEnabled,
  isBiometricEnabled,
  saveBiometricToken,
  clearBiometricToken,
} from "../../services/biometricService";
import { isPinSet } from "../../services/pinService";
import { wipeForPinFailure } from "../../services/lockService";
import { getCurrentUserId } from "../../services/userSecurityKeys";
import { colors, radius, typography } from "../../theme/tokens";

const FACE_ID_ICON = require("../../assets/Face_ID.png");

const getRootNavigation = (navigation) => {
  let current = navigation;
  while (current?.getParent?.()) current = current.getParent();
  return current ?? navigation;
};

export default function SecurityPage() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();

  const [biometric, setBiometric]         = useState(false);
  const [biometricInfo, setBiometricInfo] = useState(null);
  const [checking, setChecking]           = useState(true);
  const [pinSet, setPinSet]               = useState(false);
  const [userId, setUserId]               = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = await getCurrentUserId();
        setUserId(uid);
        if (!uid) return;
        const [enabled, support, pin] = await Promise.all([
          isBiometricEnabled(uid),
          checkSupport(),
          isPinSet(uid),
        ]);
        setBiometric(enabled && support.supported);
        setBiometricInfo(support);
        setPinSet(pin);
      } catch (error) {
        if (__DEV__) {
          console.warn("[Security] failed to load security settings:", error?.message);
        }
        setBiometric(false);
        setBiometricInfo({ supported: false, reasonCode: "unknown" });
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const handleResetPin = () => {
    Alert.alert(
      t("security.resetPinTitle"),
      t("security.resetPinMsg"),
      [
        { text: t("security.cancel"), style: "cancel" },
        {
          text: t("security.reset"),
          style: "destructive",
          onPress: async () => {
            await wipeForPinFailure(userId);
            getRootNavigation(navigation).reset({ index: 0, routes: [{ name: "Login" }] });
          },
        },
      ],
    );
  };

  const toggleBiometric = async (val) => {
    if (!biometricInfo?.supported || !userId) {
      Alert.alert(
        t("security.notSupportedTitle"),
        t(
          `security.reason.${biometricInfo?.reasonCode ?? "unknown"}`,
          { defaultValue: biometricSubtitle },
        ),
      );
      return;
    }

    if (val) {
      const token = await getAuthToken();
      if (!token) {
        Alert.alert(
          t("security.verifyFailTitle"),
          t("security.verifyFailMsg"),
        );
        return;
      }

      try {
        const prompt = t("security.enablePrompt", { label: biometricLabel });
        await saveBiometricToken(userId, token, prompt);
      } catch (_) {
        Alert.alert(
          t("security.verifyFailTitle"),
          t("security.verifyFailMsg"),
        );
        return;
      }

      setBiometric(true);
      await setBiometricEnabled(userId, true);
      Alert.alert(
        t("security.enabledTitle"),
        t("security.enabledMsg", { label: biometricLabel }),
      );
    } else {
      Alert.alert(
        t("security.disableTitle"),
        t("security.disableMsg"),
        [
          { text: t("security.cancel"), style: "cancel" },
          {
            text: t("security.close"),
            style: "destructive",
            onPress: async () => {
              setBiometric(false);
              await setBiometricEnabled(userId, false);
              await clearBiometricToken(userId);
            },
          },
        ],
      );
    }
  };

  const biometricPresentation = getBiometricPresentation(biometricInfo);
  const biometricLabel = Platform.OS === "android"
    ? t("security.biometricGeneric")
    : biometricPresentation.kind === "face"
      ? "Face ID"
      : t("security.biometricFinger");
  const biometricTitle = Platform.OS === "android"
    ? t("security.biometricAndroid")
    : t("security.biometric");
  const biometricSubtitle = Platform.OS === "android"
    ? t("security.biometricAndroidSub")
    : t("security.biometricSub");
  const biometricReason = biometricInfo?.reasonCode
    ? t(`security.reason.${biometricInfo.reasonCode}`, {
        defaultValue: biometricSubtitle,
      })
    : biometricSubtitle;
  const biometricIcon = biometricPresentation.icon;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity
          className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ ...typography.sectionTitle, color: colors.surface }}>{t("security.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ ...typography.label, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: "uppercase" }}>
          {t("security.section")}
        </Text>

        <View className="bg-white mx-4 overflow-hidden" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>
          <View className="flex-row items-center gap-[14px] px-4 py-[16px]">
            <View className="w-10 h-10 rounded-xl bg-brand items-center justify-center shrink-0">
              {biometricIcon === "faceid" ? (
                <Image source={FACE_ID_ICON} style={{ width: 22, height: 22 }} resizeMode="contain" />
              ) : (
                <Ionicons name={biometricIcon} size={20} color="#fff" />
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className="text-[16px]"
                style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {biometricTitle}
              </Text>
              {checking ? (
                <Text style={{ ...typography.secondary, marginTop: 2 }}>{t("security.checking")}</Text>
              ) : !biometricInfo?.supported ? (
                <Text style={{ ...typography.secondary, marginTop: 2 }} numberOfLines={2}>
                  {biometricReason}
                </Text>
              ) : biometric ? (
                <Text style={{ ...typography.secondary, color: colors.primary, fontWeight: "500", marginTop: 2 }}>{t("security.active")}</Text>
              ) : (
                <Text style={{ ...typography.secondary, marginTop: 2 }} numberOfLines={2}>
                  {biometricSubtitle}
                </Text>
              )}
            </View>
            <Switch
              value={biometric}
              onValueChange={toggleBiometric}
              disabled={checking || !biometricInfo?.supported}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              ios_backgroundColor={colors.border}
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        {biometricInfo?.supported && (
          <View className="flex-row items-start gap-2 mx-4 mt-4 p-[14px]" style={{ backgroundColor: colors.primaryMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text className="flex-1" style={typography.caption}>
              {Platform.OS === "android"
                ? t("security.biometricAndroidNote")
                : t("security.biometricNote", { label: biometricLabel })}
            </Text>
          </View>
        )}

        <View className="bg-white mx-4 mt-4 overflow-hidden" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>
          <View className="flex-row items-center gap-[14px] px-4 py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View className="w-10 h-10 rounded-xl bg-brand items-center justify-center">
              <Ionicons name="keypad-outline" size={20} color="#fff" />
            </View>
            <View className="flex-1">
              <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>{t("security.pinStatus")}</Text>
              <Text style={{ ...typography.secondary, color: pinSet ? colors.primary : colors.textMuted, fontWeight: "500", marginTop: 2 }}>
                {pinSet ? t("security.pinStatusSet") : t("security.pinStatusNotSet")}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            className="flex-row items-center gap-[14px] px-4 py-[16px]"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={() => navigation.navigate("ChangePin")}
            activeOpacity={0.7}
            disabled={!pinSet}
          >
            <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primaryMuted }}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </View>
            <Text style={{ ...typography.body, flex: 1, fontSize: 16, lineHeight: 24, fontWeight: "600", color: pinSet ? colors.text : colors.textMuted }}>
              {t("security.changePin")}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center gap-[14px] px-4 py-[16px]"
            onPress={handleResetPin}
            activeOpacity={0.7}
            disabled={!pinSet}
          >
            <View className="w-10 h-10 rounded-xl bg-[#fde7e7] items-center justify-center">
              <Ionicons name="refresh-outline" size={20} color="#df4c4b" />
            </View>
            <View className="flex-1">
              <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600", color: pinSet ? colors.danger : colors.textMuted }}>
                {t("security.resetPin")}
              </Text>
              <Text style={{ ...typography.secondary, marginTop: 2 }}>{t("security.resetPinSub")}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
