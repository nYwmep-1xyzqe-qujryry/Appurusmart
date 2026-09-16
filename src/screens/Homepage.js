import React, { useMemo } from "react";
import { View, ScrollView, StatusBar, Platform, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import HeaderBar from "../components/HeaderBar";
import ServiceIconGrid from "../components/ServiceIconGrid";
import AnnouncementCarousel from "../components/AnnouncementCarousel";
import useCurrentUser from "../hook/useCurrentUser";
import useFetch from "../hook/useFetch";
import useExpertStats from "../hook/useExpertStats";
import { colors, shadows } from "../theme/tokens";
import { normalizeAnnouncements } from "../utils/announcement";

const cardShadow = shadows.card;

const StatItem = ({ item, value, loading, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    className="flex-1 items-center"
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={item.label}
  >
    <LinearGradient
      colors={item.grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 }}
    >
      <Ionicons name={item.icon} size={22} color="rgba(255,255,255,0.95)" />
    </LinearGradient>
    <Text className="text-[22px] font-black" style={{ color: item.color, fontVariant: ["tabular-nums"], letterSpacing: 0 }}>
      {loading ? "—" : (value ?? 0)}
    </Text>
    <Text
      className="text-[10px] font-semibold text-center mt-[2px]"
      style={{ color: item.labelColor ?? item.color }}
    >
      {item.label}
    </Text>
  </TouchableOpacity>
);

const Homepage = ({ navigation }) => {
  const { t } = useTranslation();
  const { user, logout } = useCurrentUser(navigation);
  const { stats, loading: statsLoading, refetch: refetchStats } = useExpertStats();

  useFocusEffect(
    React.useCallback(() => {
      refetchStats();
    }, [refetchStats])
  );

  const STAT_CONFIG = useMemo(() => [
    { key: "researches", icon: "bar-chart-outline", label: t("home.statResearch"), color: "#0f7a55", bg: "#d6f0e3", grad: ["#0f7a55", "#1a9068"], route: "ResearchForm" },
    { key: "journals",   icon: "newspaper-outline", label: t("home.statJournal"),  color: "#185fa5", bg: "#e8f0fb", grad: ["#185fa5", "#2979c8"], route: "JournalForm" },
    { key: "patents",    icon: "ribbon-outline",    label: t("home.statPatent"),   color: "#7b1fa2", bg: "#f3e5f5", grad: ["#7b1fa2", "#9c27b0"], route: "PatentForm" },
    { key: "awards",     icon: "trophy-outline",    label: t("home.statAward"),    color: "#e65100", labelColor: "#B54708", bg: "#fff3e0", grad: ["#e65100", "#f57c00"], route: "AwardForm" },
  ], [t]);

  const openWorkManager = (item) => {
    navigation.navigate(item.route, { item: null });
  };

  const { data: announcements } = useFetch("/announcements", {
    initialData: [],
    params: { limit: 5 },
  });
  const announcementItems = useMemo(
    () => normalizeAnnouncements(announcements, t("announce.defaultTitle")),
    [announcements, t],
  );
  const hasAnnouncements = announcementItems.length > 0;

  return (
    <View className="flex-1" style={{ backgroundColor: "#eaf5ef" }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <HeaderBar
        name={user.name}
        photoUrl={user.photoUrl}
        onNotification={() => navigation.navigate("Notifications")}
        onLogout={logout}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 18, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Announcement Carousel */}
        <AnnouncementCarousel
          items={announcementItems}
          onViewAll={() => navigation.navigate("Announcements", {
            items: hasAnnouncements ? announcementItems : undefined,
          })}
          onPressItem={(item) => navigation.navigate("AnnouncementDetail", {
            announcementId: item.id,
            announcement: item,
          })}
          autoPlayMs={3500}
        />

        {/* ── Services Card ── */}
        <View className="mx-4 bg-white rounded-[20px] overflow-hidden" style={cardShadow}>
          <LinearGradient
            colors={["#f6fcf9", "#eef8f3"]}
            style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#e0eeea" }}
          >
            <View className="flex-row items-center gap-2">
              <View className="w-7 h-7 rounded-[9px] bg-primary items-center justify-center">
                <Ionicons name="grid-outline" size={15} color="#fff" />
              </View>
              <Text className="text-[15px] font-extrabold text-[#0a3d2a]">{t("home.services")}</Text>
            </View>
          </LinearGradient>
          <View className="px-3 pt-3 pb-4">
            <ServiceIconGrid navigation={navigation} />
          </View>
        </View>

        {/* ── My Work Card ── */}
        <View className="mx-4 bg-white rounded-[20px] overflow-hidden" style={cardShadow}>
          <LinearGradient
            colors={["#f0fdfb", "#e6f7f5"]}
            style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#b2dfdb" }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="w-7 h-7 rounded-[9px] bg-[#0d9488] items-center justify-center">
                  <Ionicons name="trophy-outline" size={15} color="#fff" />
                </View>
                <Text className="text-[15px] font-extrabold text-[#00695c]">{t("home.myWork")}</Text>
              </View>
              <TouchableOpacity
                className="flex-row items-center gap-1 bg-[#0d9488] rounded-full px-3 py-[5px]"
                onPress={() => navigation.navigate("Research")}
                activeOpacity={0.8}
              >
                <Text className="text-white text-[11px] font-bold">{t("home.manage")}</Text>
                <Ionicons name="chevron-forward" size={11} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Stats grid */}
          <View className="flex-row px-4 pt-5 pb-4">
            {STAT_CONFIG.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && (
              <View style={{ width: 1, backgroundColor: "#e0f2f1", marginVertical: 6 }} />
                )}
                <StatItem
                  item={item}
                  value={stats[item.key]}
                  loading={statsLoading}
                  onPress={() => openWorkManager(item)}
                />
              </React.Fragment>
            ))}
          </View>

          <View className="h-px bg-[#e0f2f1] mx-4" />

          {/* Add button */}
          <View className="px-4 py-4">
            <TouchableOpacity
              className="flex-row items-center justify-center gap-2 rounded-[14px] py-[13px]"
              style={{ backgroundColor: "#0d9488" }}
              onPress={() => navigation.navigate("Research")}
              activeOpacity={0.82}
            >
              <View className="w-6 h-6 rounded-full bg-white/20 items-center justify-center">
                <Ionicons name="add" size={16} color="#fff" />
              </View>
              <Text className="text-white text-[14px] font-bold tracking-[0.2px]">{t("home.addWork")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default Homepage;
