import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Image, ScrollView, Share, StatusBar,
  Text, TouchableOpacity, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import HeaderBar from "../components/HeaderBar";
import useCurrentUser from "../hook/useCurrentUser";
import api from "../services/api";
import { stripNamePrefix } from "../utils/name";
import { fixPhotoUrl } from "../utils/image";
import { colors, radius, shadows, typography } from "../theme/tokens";

const logo = require("../assets/urusmartlogo.png");

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");


const normalize = (d) => {
  const firstName = str(d.firstname_th) || str(d.firstname_en) || str(d.first_name_th) || str(d.first_name_en);
  const lastName  = str(d.lastname_th)  || str(d.lastname_en)  || str(d.last_name_th)  || str(d.last_name_en);
  const fullName  =
    str(d.full_name_th) || str(d.full_name_en) ||
    str(d.name) || str(d.full_name) || str(d.teacher_name) ||
    (firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName);

  if (__DEV__) console.log("[Card /me keys]", Object.keys(d), "→ name:", fullName);

  return {
    name:       fullName,
    position:   str(d.position_name) || str(d.position_label) || str(d.position) || str(d.academic_position),
    faculty:    str(d.faculty_name_th) || str(d.faculty_name_en) || str(d.faculty_name) || str(d.main_unit_name) || str(d.faculty),
    department: str(d.department_name_th) || str(d.department_name_en) || str(d.department_name) || str(d.program) || str(d.major) || str(d.sub_unit_name) || str(d.department),
    email:      str(d.email) || str(d.teacher_email),
    phone:      str(d.phone) || str(d.tel) || str(d.mobile) || str(d.phone_work) || str(d.phone_mobile),
    phoneWork:  str(d.phone_work) || str(d.phone) || str(d.tel),
    profileId:  String(d.id ?? d.user_id ?? d.profile_id ?? ""),
    photoUrl:   fixPhotoUrl(str(d.picture) || str(d.photo_url) || str(d.photoUrl) || str(d.avatar) || str(d.profile_image)),
  };
};

const initial = (name) =>
  name?.replace(/^(อาจารย์|ดร\.|ผศ\.|รศ\.)\s*/, "")?.trim()?.[0] ?? "อ";

// ── Skeleton row แสดงระหว่างรอ API ──────────────────────────────
const SkeletonRow = ({ pulse }) => (
  <View className="flex-row items-center py-[10px] gap-3">
    <Animated.View className="w-[30px] h-[30px] rounded-[10px] bg-[#e0ebe6]" style={{ opacity: pulse }} />
    <View className="flex-1 gap-[6px]">
      <Animated.View className="h-[9px] w-1/3 rounded-full bg-[#e0ebe6]" style={{ opacity: pulse }} />
      <Animated.View className="h-[13px] w-3/4 rounded-full bg-[#d4e8de]" style={{ opacity: pulse }} />
    </View>
  </View>
);

const InfoRow = ({ icon, label, value }) => (
  <View className="flex-row items-start py-[10px]">
    <View
      className="w-[34px] h-[34px] items-center justify-center mr-3 mt-[1px]"
      style={{
        backgroundColor: colors.primarySoft,
        borderColor: colors.borderStrong,
        borderRadius: radius.sm,
        borderWidth: 1,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.primary} />
    </View>
    <View className="flex-1">
      <Text style={{ ...typography.label, color: colors.textMuted, fontSize: 13, lineHeight: 19, textTransform: "uppercase", marginBottom: 3 }}>{label}</Text>
      <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600" }}>{value || "—"}</Text>
    </View>
  </View>
);

const Divider = () => <View className="h-px mx-1" style={{ backgroundColor: colors.border }} />;

const cardShadow = shadows.floating;
const photoShadow = {
  shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18, shadowRadius: 16, elevation: 6,
};
export default function Cardpage({ navigation }) {
  const { t } = useTranslation();
  const { user, logout } = useCurrentUser(navigation);
  const [photoFailed, setPhotoFailed] = useState(false);

  // แสดงข้อมูล user ทันที ไม่รอ API
  const [teacher, setTeacher] = useState(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [error, setError] = useState(null);

  // Animation เริ่มทันที ไม่รอ API
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  // Skeleton pulse animation
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // แสดง card ทันที
    Animated.parallel([
      Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 9 }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }),
    ]).start();

    // skeleton pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();

    // fetch API in background
    let cancelled = false;
    (async () => {
      try {
        setApiLoading(true);
        const res = await api.get("/me");
        if (!cancelled) setTeacher(normalize(res.data?.data ?? res.data));
      } catch (e) {
        if (!cancelled) { setError(e.message); setTeacher(normalize({})); }
      } finally {
        if (!cancelled) { setApiLoading(false); pulse.stop(); }
      }
    })();

    return () => { cancelled = true; pulse.stop(); };
  }, []);

  // merge: API data > cached user > empty (ไม่ fallback ชื่อปลอม)
  const raw = teacher ?? {};
  const tc = {
    name:       raw.name       || user.name       || "",
    position:   raw.position   || "",
    faculty:    raw.faculty    || user.faculty     || "",
    department: raw.department || "",
    email:      raw.email      || "",
    phone:      raw.phone      || "",
    phoneWork:  raw.phoneWork  || "",
    profileId:  raw.profileId  || "",
    photoUrl:   user.photoUrl,
  };

  useEffect(() => setPhotoFailed(false), [tc.photoUrl]);

  const displayName = stripNamePrefix(tc.name);

  const ini = initial(tc.name);
  const affiliation = [tc.faculty, tc.department].filter(Boolean).join(" ");
  const handleShare = async () => {
    try {
      await Share.share({
        title: "Digital Staff Card – URUSmart",
        message: [
          t("card.shareMsg"),
          displayName,
          tc.position,
          affiliation,
          tc.email ? `Email: ${tc.email}` : "",
          tc.phone ? `โทร: ${tc.phone}` : "",
        ].filter(Boolean).join("\n"),
      });
    } catch {}
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <HeaderBar
        name={tc.name || user.name}
        photoUrl={tc.photoUrl || user.photoUrl}
        onNotification={() => navigation.navigate("Notifications")}
        onLogout={logout}
      />

      {error && (
        <View className="flex-row items-center gap-[6px] px-4 py-[7px]" style={{ backgroundColor: colors.surfaceWarning, borderBottomWidth: 1, borderBottomColor: colors.borderWarning }}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text className="text-[13px] font-bold" style={{ color: colors.accentText }}>{t("card.offline")}</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36 }}
      >
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: "100%", maxWidth: 440 }}
          className="items-center"
        >
          {/* ══ Card ══ */}
          <View className="w-full" style={cardShadow}>
            <View className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>

              {/* ── Header band with gradient ── */}
              <LinearGradient
                colors={[colors.primaryDark, colors.primaryLight, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 64, overflow: "hidden" }}
              >
                {/* Top row */}
                <View className="flex-row items-center justify-between">
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.sm,
                      overflow: "hidden",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Image source={logo} style={{ width: 48, height: 48 }} resizeMode="contain" />
                  </View>
                  <View className="flex-row items-center gap-[5px] bg-white/20 border border-white/30 rounded-full px-3 py-[5px]">
                    <View className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: colors.brandYellow }} />
                    <Text className="text-white text-[11px] font-semibold" style={{ lineHeight: 17, letterSpacing: 0 }}>{t("card.activeBadge")}</Text>
                  </View>
                </View>

                <Text className="text-white text-[21px] font-bold mt-5" style={{ lineHeight: 29, letterSpacing: 0 }}>{t("card.title")}</Text>
                <Text className="text-white/70 text-[12px] mt-[4px]" style={{ lineHeight: 18, fontWeight: "400", letterSpacing: 0 }}>Uttaradit Rajabhat University</Text>

              </LinearGradient>

              {/* ── Photo (sits on band seam) ── */}
              <View
                className="self-center w-[112px] h-[112px] rounded-full bg-white overflow-hidden"
                style={{ marginTop: -56, borderWidth: 4, borderColor: "#fff", ...photoShadow }}
              >
                {tc.photoUrl && !photoFailed ? (
                  <Image
                    source={{ uri: tc.photoUrl }}
                    className="w-full h-full"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <LinearGradient colors={["#d4efe5", colors.borderStrong]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: colors.primary, fontSize: 52, fontWeight: "900" }}>{ini}</Text>
                  </LinearGradient>
                )}
              </View>

              {/* ── Name & position ── */}
              <View className="items-center px-5 pt-3 pb-[2px]">
                {apiLoading && !tc.name ? (
                  <Animated.View className="h-[22px] w-[180px] rounded-full bg-[#d4e8de]" style={{ opacity: pulseAnim }} />
                ) : (
                  <Text style={{ ...typography.pageTitle, fontSize: 21, lineHeight: 29, textAlign: "center" }}>
                    {displayName || "—"}
                  </Text>
                )}
                {apiLoading && !tc.position ? (
                  <Animated.View className="h-[28px] w-[140px] rounded-full bg-[#e0ebe6] mt-[8px]" style={{ opacity: pulseAnim }} />
                ) : !!tc.position && (
                  <View className="flex-row items-center gap-[5px] mt-[8px] bg-[#eef8f3] border border-[#d4efe5] rounded-full px-4 py-[6px]">
                    <Ionicons name="ribbon-outline" size={13} color={colors.primary} />
                    <Text style={{ ...typography.caption, color: colors.primary, fontWeight: "500" }}>{tc.position}</Text>
                  </View>
                )}
                {!!affiliation && (
                  <Text style={{ ...typography.secondary, marginTop: 6, textAlign: "center" }}>{affiliation}</Text>
                )}
              </View>

              {/* ── Divider line ── */}
              <View className="h-px mx-5 mt-4" style={{ backgroundColor: colors.border }} />

              {/* ── Contact information ── */}
              <View className="px-5 pt-4 pb-6">
                <View>
                    {apiLoading ? (
                      <>
                        <SkeletonRow pulse={pulseAnim} />
                        <Divider />
                        <SkeletonRow pulse={pulseAnim} />
                        <Divider />
                        <SkeletonRow pulse={pulseAnim} />
                        <Divider />
                        <SkeletonRow pulse={pulseAnim} />
                      </>
                    ) : (
                      <>
                        <InfoRow icon="business-outline" label={t("card.affiliation")} value={affiliation} />
                        <Divider />
                        <InfoRow icon="mail-outline" label={t("card.email")} value={tc.email} />
                        <Divider />
                        <InfoRow icon="call-outline" label={t("card.phone")} value={tc.phone} />
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>
          {/* ══ Share Button ══ */}
          <TouchableOpacity
            className="flex-row items-center justify-center gap-[10px] mt-4 w-full py-4"
            style={[{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg }, shadows.card]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: colors.primarySoft }}>
              <Ionicons name="share-social-outline" size={17} color={colors.primaryDark} />
            </View>
            <Text style={{ ...typography.button, color: colors.primaryDark }}>{t("card.share")}</Text>
          </TouchableOpacity>

          {/* ── Footer note ── */}
          <View className="flex-row items-center gap-[5px] mt-4 opacity-40">
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.primaryLight} />
            <Text className="text-[11px] font-bold" style={{ color: colors.primaryLight }}>URUSmart Official Digital Card</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
