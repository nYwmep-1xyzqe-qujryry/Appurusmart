import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import AppHeader from "../../components/AppHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useMenuCounts from "../../hook/useMenuCounts";
import useInterestOptions from "../../hook/useInterestOptions";
import useExpertGroupOptions from "../../hook/useExpertGroupOptions";
import SheetDropdown from "../../components/expert/SheetDropdown";
import { colors } from "../../theme/tokens";
import { sanitizeAcademicText } from "../../utils/inputSanitize";
import infoApi from "../../services/infoApi";

const getSearchByOptions = (t) => [
  { id: "", label: t("research.screen.from") },
  { id: "firstname", label: t("research.screen.firstName") },
  { id: "lastname", label: t("research.screen.lastName") },
  { id: "expertise_group", label: t("research.screen.expertGroup") },
  { id: "interest", label: t("research.screen.interest") },
  { id: "research", label: t("research.screen.researchWork") },
  { id: "proceeding", label: "Proceeding" },
  { id: "journal", label: "Journal" },
];

const getPersonalMenus = (t) => [
  { id: "profile",       label: t("research.screen.editProfile"),    icon: "person-outline",    color: "#07865F", bg: "#e8f5ee" },
  { id: "education",     label: t("research.screen.manageEducation"), icon: "school-outline",    color: "#185fa5", bg: "#e8f0fb" },
  { id: "work_history",  label: t("research.screen.manageWork"),      icon: "briefcase-outline", color: "#c95b05", bg: "#fff3e0" },
  { id: "admin_history", label: t("research.screen.manageAdmin"),     icon: "business-outline",  color: "#4527a0", bg: "#ede7f6" },
];

const getExpertMenus = (t) => [
  { id: "expertise",      label: t("research.screen.manageExpertise"), icon: "flask-outline",            color: "#07865F", bg: "#e8f5ee" },
  { id: "interest",       label: t("research.screen.manageInterest"),  icon: "bulb-outline",             color: "#f57f17", bg: "#fff8e1" },
  { id: "research",       label: t("research.screen.manageResearch"),  icon: "bar-chart-outline",        color: "#185fa5", bg: "#e8f0fb" },
  { id: "journal",        label: t("research.screen.manageJournal"),   icon: "newspaper-outline",        color: "#00838f", bg: "#e0f7fa" },
  { id: "proceeding",     label: t("research.screen.manageProceeding"),icon: "document-text-outline",    color: "#4527a0", bg: "#ede7f6" },
  { id: "book",           label: t("research.screen.manageBook"),      icon: "library-outline",          color: "#2e7d32", bg: "#e8f5e9" },
  { id: "patent",         label: t("research.screen.managePatent"),    icon: "ribbon-outline",           color: "#7b1fa2", bg: "#f3e5f5" },
  { id: "award",          label: t("research.screen.manageAward"),     icon: "trophy-outline",           color: "#e65100", bg: "#fff3e0" },
  { id: "speaker",        label: t("research.screen.manageSpeaker"),   icon: "mic-outline",              color: "#c62828", bg: "#fce4ec" },
  { id: "training",       label: t("research.screen.manageTraining"),  icon: "clipboard-outline",        color: "#1565c0", bg: "#e3f2fd" },
  { id: "service",        label: t("research.screen.manageService"),   icon: "people-outline",           color: "#07865F", bg: "#e8f5ee" },
  { id: "human_subjects", label: t("research.screen.manageHuman"),     icon: "shield-checkmark-outline", color: "#bf360c", bg: "#fbe9e7" },
];

const cleanParams = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );

const ResearchDropdown = SheetDropdown;

// Shared style ให้ dropdown ทั้ง 3 ช่องและ TextInput คำค้นมีขนาด/ระยะห่างตรงกันเป๊ะ
// ไม่ให้แต่ละช่องพึ่ง padding ของตัวเองแยกกันจนสูง/กว้างไม่เท่ากัน
const SEARCH_FIELD_CONTAINER_CLASS = "";
const searchFieldStyle = {
  borderRadius: 12,
  minHeight: 46,
  paddingHorizontal: 14,
  fontSize: 14,
  lineHeight: 20,
  letterSpacing: 0,
};
const searchTextStyle = { fontSize: 14, lineHeight: 20, letterSpacing: 0 };

const SearchSection = ({ onSearch }) => {
  const { t } = useTranslation();
  const SEARCH_BY_OPTIONS = getSearchByOptions(t);
  const [searchBy, setSearchBy] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedInterest, setSelectedInterest] = useState("");
  const { options: rawExpertGroups, loading: loadingExpertGroups } = useExpertGroupOptions();
  const expertGroups = [{ id: "", label: t("research.screen.selectGroupPlaceholder") }, ...rawExpertGroups];
  const { options: rawInterests, loading: loadingInterests } = useInterestOptions();
  const interestOptions = [{ id: "", label: t("research.screen.selectInterestPlaceholder") }, ...rawInterests];

  const submitSearch = (params) => {
    const cleaned = cleanParams(params);
    if (__DEV__) console.log("[Research] profile-search params:", cleaned);
    onSearch(cleaned);
  };

  const runKeywordSearch = () => {
    const trimmedKeyword = keyword.trim();
    // backend ปฏิเสธ (422) เมื่อส่ง search_by โดยไม่มี keyword คู่มาด้วย — ถ้า
    // เลือกประเภทการค้นหาไว้แต่ไม่ได้พิมพ์คำค้น ให้ไม่ส่ง search_by เลย
    // (เท่ากับเรียก /profile-search แบบไม่ระบุ filter คืนรายชื่อทั้งหมดแทน)
    submitSearch({
      search_by: trimmedKeyword ? searchBy : "",
      keyword: trimmedKeyword,
    });
  };

  const runGroupSearch = () => {
    if (selectedInterest) {
      const selectedInterestOption = rawInterests.find(
        (interest) => String(interest.id) === String(selectedInterest),
      );
      submitSearch({
        search_by: "interest",
        keyword: selectedInterestOption?.label ?? selectedInterest,
        interest_id: selectedInterestOption?.id ?? selectedInterest,
      });
      return;
    }

    const selectedGroupOption = expertGroups.find(
      (group) => String(group.id) === String(selectedGroup),
    );

    submitSearch({
      expertise_group_id: selectedGroup,
      group_id: selectedGroup,
      expertise: selectedGroupOption?.label ?? "",
    });
  };

  return (
    <View
      className="bg-white overflow-hidden border border-[#e5edf0]"
      style={{ borderRadius: 18 }}
    >
      <LinearGradient
        colors={["#f1fbf6", "#e7f5ee"]}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: "#d5ebdf",
        }}
      >
        <View className="flex-row items-center gap-[7px]">
          <View
            className="items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: colors.primary,
            }}
          >
            <Ionicons name="search-outline" size={18} color="#fff" />
          </View>
          <Text className="text-[15px] font-bold text-[#0a4d35]" style={{ lineHeight: 22, letterSpacing: 0 }}>
            {t("research.screen.searchTitle")}
          </Text>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 }}>
        <Text className="mb-[6px] text-[13px] font-semibold text-[#68756f]">
          {t("research.screen.searchByKeyword")}
        </Text>
        <ResearchDropdown
          value={searchBy}
          options={SEARCH_BY_OPTIONS}
          placeholder={t("research.screen.selectSearchType")}
          onSelect={setSearchBy}
          containerClassName={SEARCH_FIELD_CONTAINER_CLASS}
          triggerStyle={searchFieldStyle}
          triggerTextStyle={searchTextStyle}
        />

        <View className="flex-row items-center mt-[10px] gap-2">
          <TextInput
            className="flex-1 bg-[#f5f7f8] border border-[#e4e9ed] text-[14px] text-[#1a1a2e]"
            style={{ ...searchFieldStyle, minWidth: 0 }}
            placeholder={t("research.screen.keyword")}
            placeholderTextColor="#5F7069"
            value={keyword}
            onChangeText={(text) => setKeyword(sanitizeAcademicText(text))}
            onSubmitEditing={runKeywordSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            className="items-center justify-center px-4"
            style={{
              width: 88,
              minHeight: 46,
              borderRadius: 12,
              backgroundColor: colors.primary,
            }}
            onPress={runKeywordSearch}
          >
            <Text className="text-white text-[14px] font-bold">
              {t("research.screen.search")}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center my-3 gap-3">
          <View className="flex-1 h-px bg-[#e1e7e8]" />
          <Text className="text-[13px] text-[#a9aaa9] font-semibold">
            {t("research.screen.or")}
          </Text>
          <View className="flex-1 h-px bg-[#e1e7e8]" />
        </View>

        <Text className="mb-[6px] text-[13px] font-semibold text-[#68756f]">
          {t("research.screen.searchByGroup")}
        </Text>
        <View className="gap-[7px]">
          <ResearchDropdown
            value={selectedGroup}
            options={expertGroups}
            placeholder={t("research.screen.selectGroupPlaceholder")}
            onSelect={(value) => {
              setSelectedGroup(value);
              if (value) setSelectedInterest("");
            }}
            loading={loadingExpertGroups}
            searchable
            containerClassName={SEARCH_FIELD_CONTAINER_CLASS}
            triggerStyle={searchFieldStyle}
            triggerTextStyle={searchTextStyle}
          />
          <ResearchDropdown
            value={selectedInterest}
            options={interestOptions}
            placeholder={t("research.screen.selectInterestPlaceholder")}
            onSelect={(value) => {
              setSelectedInterest(value);
              if (value) setSelectedGroup("");
            }}
            loading={loadingInterests}
            searchable
            containerClassName={SEARCH_FIELD_CONTAINER_CLASS}
            triggerStyle={searchFieldStyle}
            triggerTextStyle={searchTextStyle}
          />
        </View>

        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 mt-[10px] px-4"
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            minHeight: 48,
          }}
          onPress={runGroupSearch}
        >
          <Ionicons name="search-outline" size={18} color="#fff" />
          <Text className="text-white text-[15px] font-bold">
            {t("research.screen.search")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const CountBadge = ({ count, color, bg, loading }) => {
  if (loading) {
    return (
      <View style={{ width: 28, height: 20, borderRadius: 10, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
        <ActivityIndicator size="small" color="#ccc" style={{ transform: [{ scale: 0.6 }] }} />
      </View>
    );
  }
  const display = count === null ? "—" : count === 0 ? "0" : String(count);
  return (
    <View style={{
      minWidth: 26, height: 20, borderRadius: 10,
      backgroundColor: bg, paddingHorizontal: 6,
      alignItems: "center", justifyContent: "center", marginRight: 8,
    }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color, letterSpacing: 0 }}>{display}</Text>
    </View>
  );
};

const MenuItem = ({ item, onPress, isLast, count, countLoading }) => (
  <TouchableOpacity
    className={`flex-row items-center justify-between px-4 py-[14px] ${!isLast ? "border-b border-[#f4f6f8]" : ""}`}
    onPress={() => onPress(item)}
    activeOpacity={0.7}
  >
    <View className="flex-row items-center flex-1 gap-3">
      <View className="w-[38px] h-[38px] rounded-xl items-center justify-center" style={{ backgroundColor: item.bg }}>
        <Ionicons name={item.icon} size={19} color={item.color} />
      </View>
      <Text className="text-[14px] font-semibold text-[#1a1a2e] flex-1 leading-5">{item.label}</Text>
    </View>
    <View className="flex-row items-center">
      {count !== undefined && (
        <CountBadge count={count} color={item.color} bg={item.bg} loading={countLoading} />
      )}
      <View className="w-7 h-7 rounded-full bg-[#f4f6f8] items-center justify-center">
        <Ionicons name="chevron-forward" size={14} color="#5F7069" />
      </View>
    </View>
  </TouchableOpacity>
);

const SectionCard = ({ title, sectionIcon, gradColors, items, onPress, counts, countLoading }) => (
  <View className="bg-white rounded-2xl overflow-hidden border border-[#e8ecf0]">
    <LinearGradient colors={gradColors} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e8ecf0" }}>
      <View className="flex-row items-center gap-2">
        <View className="w-7 h-7 rounded-[9px] bg-white/30 items-center justify-center">
          <Ionicons name={sectionIcon} size={15} color="#fff" />
        </View>
        <Text className="text-[14px] font-bold text-white">{title}</Text>
        <View className="ml-auto bg-white/25 rounded-full px-2 py-[2px]">
          <Text className="text-white text-[12px] font-bold">{items.length}</Text>
        </View>
      </View>
    </LinearGradient>
    {items.map((item, index) => (
      <MenuItem
        key={item.id}
        item={item}
        onPress={onPress}
        isLast={index === items.length - 1}
        count={counts ? counts[item.id] : undefined}
        countLoading={countLoading}
      />
    ))}
  </View>
);

const ExpertHome = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const PERSONAL_MENUS = getPersonalMenus(t);
  const EXPERT_MENUS = getExpertMenus(t);
  const { counts, loading: countsLoading, refetch: refetchCounts } = useMenuCounts();

  // เตรียม Expert profile ก่อนโหลดข้อมูลของโมดูลทุกครั้งที่เปิดหน้า Expert
  // backend จะอ่านเจ้าของจาก Bearer token; frontend ไม่ส่ง owner/id_card ใด ๆ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await infoApi.post("/info/expert/profile/ensure", {});
        const { data } = await infoApi.get("/info/expert/profile");
        const profile = data?.data?.profile ?? data?.data ?? data;
        const photoUrl = /^https:\/\//i.test(profile?.picture ?? "")
          ? profile.picture
          : null;
        if (__DEV__ && !cancelled) {
          console.log("[ExpertHome] ensured profile", {
            hasProfile: Boolean(profile),
            photoUrl: photoUrl ?? "<default-avatar>",
          });
        }
      } catch (error) {
        if (__DEV__ && !cancelled) {
          console.warn(
            "[ExpertHome] ensure profile failed:",
            error?.response?.status ?? error?.message,
          );
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetchCounts();
    }, [refetchCounts]),
  );

  const handleMenuPress = (item) => {
    const routes = {
      profile: () => navigation.navigate("ProfileForm", { item: null }),
      education: () => navigation.navigate("EducationForm"),
      work_history: () => navigation.navigate("WorkHistoryForm"),
      admin_history: () => navigation.navigate("AdminHistoryForm"),
      expertise: () => navigation.navigate("ExpertiseForm", { item: null }),
      interest: () => navigation.navigate("InterestForm", { item: null }),
      journal: () => navigation.navigate("JournalForm", { item: null }),
      proceeding: () => navigation.navigate("ProceedingForm", { item: null }),
      book: () => navigation.navigate("BookForm", { item: null }),
      patent: () => navigation.navigate("PatentForm", { item: null }),
      award: () => navigation.navigate("AwardForm", { item: null }),
      speaker: () => navigation.navigate("SpeakerForm", { item: null }),
      training: () => navigation.navigate("TrainingForm", { item: null }),
      service: () => navigation.navigate("ServiceForm", { item: null }),
      human_subjects: () => navigation.navigate("HumanSubjectsForm", { item: null }),
    };
    if (routes[item.id]) { routes[item.id](); return; }
    navigation.navigate("ResearchForm", { type: item.id, title: item.label, icon: item.icon });
  };

  return (
    <View className="flex-1 bg-[#F4F8F5]">
      <AppHeader title={t("research.screen.expertDb")} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 30 + insets.bottom, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SearchSection onSearch={(params) => navigation.navigate("ResearchList", { type: "search", title: t("research.screen.searchResult"), icon: "search-outline", searchParams: params })} />
        <SectionCard
          title={t("research.screen.personalInfo")}
          sectionIcon="person-outline"
          gradColors={["#1a9068", "#07865F"]}
          items={PERSONAL_MENUS}
          onPress={handleMenuPress}
          counts={counts}
          countLoading={countsLoading}
        />
        <SectionCard
          title={t("research.screen.expertManage")}
          sectionIcon="folder-open-outline"
          gradColors={["#174D42", "#0a6644"]}
          items={EXPERT_MENUS}
          onPress={handleMenuPress}
          counts={counts}
          countLoading={countsLoading}
        />
      </ScrollView>
    </View>
  );
};

export default ExpertHome;
