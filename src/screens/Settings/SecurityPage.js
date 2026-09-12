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
    <View className="flex-1 bg-[#eaf5ef]">
      <StatusBar barStyle="light-content" backgroundColor="#0f7a55" />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity
          className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text className="text-[17px] font-extrabold text-white">{t("security.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-[12px] font-bold text-[#4a5c54] px-5 pt-5 pb-2 uppercase tracking-[0.8px]">
          {t("security.section")}
        </Text>

        <View className="bg-white rounded-2xl mx-4 overflow-hidden border border-[#e0ebe4]">
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
                className="text-[15px] font-bold text-[#101b17]"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {biometricTitle}
              </Text>
              {checking ? (
                <Text className="text-[12px] text-[#7c8f86] mt-[2px]">{t("security.checking")}</Text>
              ) : !biometricInfo?.supported ? (
                <Text className="text-[12px] text-[#7c8f86] mt-[2px]" numberOfLines={2}>
                  {biometricReason}
                </Text>
              ) : biometric ? (
                <Text className="text-[12px] text-[#0f7a55] font-semibold mt-[2px]">{t("security.active")}</Text>
              ) : (
                <Text className="text-[12px] font-medium text-[#7c8f86] mt-[2px]" numberOfLines={2}>
                  {biometricSubtitle}
                </Text>
              )}
            </View>
            <Switch
              value={biometric}
              onValueChange={toggleBiometric}
              disabled={checking || !biometricInfo?.supported}
              trackColor={{ false: "#dfe8e3", true: "#1a6b3c" }}
              thumbColor="#fff"
              ios_backgroundColor="#dfe8e3"
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        {biometricInfo?.supported && (
          <View className="flex-row items-start gap-2 bg-[#e8f5ee] rounded-[14px] mx-4 mt-4 p-[14px] border border-[#e0ebe4]">
            <Ionicons name="information-circle-outline" size={16} color="#1a6b3c" />
            <Text className="flex-1 text-[12px] text-[#4a5c54] leading-[18px]">
              {Platform.OS === "android"
                ? t("security.biometricAndroidNote")
                : t("security.biometricNote", { label: biometricLabel })}
            </Text>
          </View>
        )}

        <View className="bg-white rounded-2xl mx-4 mt-4 overflow-hidden border border-[#e0ebe4]">
          <View className="flex-row items-center gap-[14px] px-4 py-[16px] border-b border-[#f0f4f2]">
            <View className="w-10 h-10 rounded-xl bg-brand items-center justify-center">
              <Ionicons name="keypad-outline" size={20} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-[#101b17]">{t("security.pinStatus")}</Text>
              <Text
                className={`text-[12px] mt-[2px] font-semibold ${pinSet ? "text-[#0f7a55]" : "text-[#4a5c54]"}`}
              >
                {pinSet ? t("security.pinStatusSet") : t("security.pinStatusNotSet")}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            className="flex-row items-center gap-[14px] px-4 py-[16px] border-b border-[#f0f4f2]"
            onPress={() => navigation.navigate("ChangePin")}
            activeOpacity={0.7}
            disabled={!pinSet}
          >
            <View className="w-10 h-10 rounded-xl bg-[#e8f5ee] items-center justify-center">
              <Ionicons name="create-outline" size={20} color="#0f7a55" />
            </View>
            <Text className={`flex-1 text-[15px] font-bold ${pinSet ? "text-[#101b17]" : "text-[#7c8f86]"}`}>
              {t("security.changePin")}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#c4d4cc" />
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
              <Text className={`text-[15px] font-bold ${pinSet ? "text-[#df4c4b]" : "text-[#7c8f86]"}`}>
                {t("security.resetPin")}
              </Text>
              <Text className="text-[12px] text-[#4a5c54] mt-[2px]">{t("security.resetPinSub")}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
