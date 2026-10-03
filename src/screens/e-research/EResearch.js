import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, Image, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import useLrdResource from "../../hook/useLrdResource";
import useLrdSession from "../../hook/useLrdSession";
import useCurrentUser from "../../hook/useCurrentUser";
import { DEGREE_OPTIONS, DEPARTMENT_OPTIONS, FACULTY_OPTIONS, getLabel } from "./mockOptions";
import { getLrd, LRD_ENDPOINTS, LRD_VISIBLE_SCOPE } from "../../services/lrdApi";
import { subscribeLrdChange } from "../../services/lrdChanges";
import { useEResearchText } from "./i18n";

const DetailRow = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <View className="flex-row items-start py-2">
      <View className="w-8 h-8 rounded-[10px] bg-[#edf7f2] items-center justify-center mr-3">
        <Ionicons name={icon} size={15} color="#07865F" />
      </View>
      <View className="flex-1">
        <Text className="text-[12px] font-semibold text-[#5F7069]">{label}</Text>
        <Text className="text-[14px] font-semibold text-[#294339] mt-[2px]" selectable>{value}</Text>
      </View>
    </View>
  );
};

const ResearcherSummary = ({ profile, education, expertise, photoUrl, onEdit, te }) => {
  const fullName = `${profile.prefix ?? ""}${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
  const faculty = profile.facultyName || getLabel(FACULTY_OPTIONS, profile.faculty);
  const department = profile.departmentName || getLabel(DEPARTMENT_OPTIONS, profile.department);
  const latestEducation = [...education].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))[0];
  const educationText = latestEducation
    ? [
        getLabel(DEGREE_OPTIONS, latestEducation.degree),
        latestEducation.qualification,
        latestEducation.major ?? latestEducation.course,
        latestEducation.university,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const initials = `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}` || "?";

  return (
    <View className="bg-white rounded-[20px] mb-5 overflow-hidden" style={{ elevation: 2, shadowColor: "#174D42", shadowOpacity: 0.07, shadowRadius: 10 }}>
      <View className="px-4 pt-4 pb-3 flex-row items-start">
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "#dff2e9", alignItems: "center", justifyContent: "center", marginRight: 12, overflow: "hidden" }}>
          {photoUrl
            ? <Image source={{ uri: photoUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
            : <Text className="text-[#07865F] text-[20px] font-black">{initials}</Text>
          }
        </View>
        <View className="flex-1 pt-1">
          <Text className="text-[18px] font-black text-[#17352a]" numberOfLines={2}>{fullName}</Text>
          <Text className="text-[13px] text-[#5F7069] mt-1" numberOfLines={2}>
            {[profile.position, department, faculty].filter(Boolean).join(" · ") || te("home.noPositionAffiliation")}
          </Text>
        </View>
        <TouchableOpacity
          className="w-11 h-11 rounded-xl bg-[#edf7f2] items-center justify-center ml-2"
          onPress={onEdit}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={te("home.researcherInfo")}
        >
          <Ionicons name="create-outline" size={19} color="#07865F" />
        </TouchableOpacity>
      </View>

      <View className="h-px bg-[#edf1ef] mx-4" />
      <View className="px-4 py-2">
        <DetailRow icon="school-outline" label={te("home.latestEducation")} value={educationText} />
        <DetailRow icon="mail-outline" label={te("home.email")} value={profile.email} />
        <DetailRow icon="call-outline" label={te("home.phone")} value={profile.phone} />
        <DetailRow icon="chatbubble-outline" label="Line ID" value={profile.lineId} />
      </View>

      <View className="px-4 pb-4">
        <Text className="text-[12px] font-semibold text-[#5F7069] mb-2">{te("home.expertise")}</Text>
        {expertise.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {expertise.slice(0, 3).map((item) => (
              <View key={item.id} className="bg-[#e8f5ee] rounded-full px-3 py-[6px]">
                <Text className="text-[12px] font-bold text-[#07865F]" numberOfLines={1}>{item.nameTh ?? item.title_th ?? ""}</Text>
              </View>
            ))}
            {expertise.length > 3 && (
              <View className="bg-[#f1f4f2] rounded-full px-3 py-[6px]">
                <Text className="text-[12px] font-bold text-[#5F7069]">+{expertise.length - 3}</Text>
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity className="min-h-[44px] border border-dashed border-[#a8c8ba] rounded-xl flex-row items-center justify-center" onPress={onEdit} activeOpacity={0.75}>
            <Ionicons name="add-circle-outline" size={17} color="#07865F" />
            <Text className="text-[13px] font-bold text-[#07865F] ml-2">{te("home.addExpertise")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const MenuCard = ({ icon, color, background, title, description, count, onPress }) => (
  <TouchableOpacity
    className="bg-white rounded-2xl p-4 mb-3 flex-row items-center"
    style={{ elevation: 2, shadowColor: "#174D42", shadowOpacity: 0.07, shadowRadius: 10 }}
    onPress={onPress}
    activeOpacity={0.78}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <View className="w-12 h-12 rounded-[14px] items-center justify-center mr-3" style={{ backgroundColor: background }}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <View className="flex-1 pr-2">
      <Text className="text-[16px] font-extrabold text-[#17352a]">{title}</Text>
      <Text className="text-[13px] text-[#5F7069] mt-1" numberOfLines={2}>{description}</Text>
    </View>
    {typeof count === "number" && (
      <View className="min-w-[32px] h-8 px-2 rounded-full bg-[#e8f5ee] items-center justify-center mr-2">
        <Text className="text-[14px] font-black text-[#07865F]">{count}</Text>
      </View>
    )}
    <Ionicons name="chevron-forward" size={20} color="#5F7069" />
  </TouchableOpacity>
);

export default function EResearch({ navigation }) {
  const { te } = useEResearchText();
  const { user } = useCurrentUser();
  const {
    session,
    researcherId,
    connected,
    loading: sessionLoading,
    connecting,
    error: sessionError,
    connectError,
    refetch: retrySession,
    connect,
  } = useLrdSession();
  const canLoadLrd = Boolean(session?.authenticated && connected);
  const autoConnectAttemptsRef = useRef(0);
  const autoConnectRetryTimerRef = useRef(null);
  // This root screen remains mounted while child e-Research screens are open.
  // Keep its data in memory instead of replacing the UI with a loading state on
  // every Back navigation. A different researcher session still gets one load.

  useEffect(() => () => {
    if (autoConnectRetryTimerRef.current) {
      clearTimeout(autoConnectRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (sessionError || !session?.authenticated || connected || connecting || sessionLoading) return;
    if (autoConnectAttemptsRef.current > 0) return;
    autoConnectAttemptsRef.current = 1;
    connect().catch(() => {});
  }, [session, connected, connecting, sessionLoading, sessionError, connect]);

  useEffect(() => {
    if (sessionError || !connectError || connected || connecting || sessionLoading) return;
    if (autoConnectAttemptsRef.current !== 1) return;

    autoConnectAttemptsRef.current = 2;
    autoConnectRetryTimerRef.current = setTimeout(() => {
      autoConnectRetryTimerRef.current = null;
      connect().catch(() => {});
    }, 4000);

    return () => {
      if (autoConnectRetryTimerRef.current) {
        clearTimeout(autoConnectRetryTimerRef.current);
        autoConnectRetryTimerRef.current = null;
      }
    };
  }, [sessionError, connectError, connected, connecting, sessionLoading, connect]);

  const [profile, setProfile] = useState({});
  const [profileLoading, setProfileLoading] = useState(false);
  const { items: education, loading: educationLoading, refetch: refetchEducation } = useLrdResource(LRD_ENDPOINTS.educations, { skip: !canLoadLrd, loadOnFocus: false });
  const { items: expertise, loading: expertiseLoading, refetch: refetchExpertise } = useLrdResource(LRD_ENDPOINTS.expertises, { skip: !canLoadLrd, loadOnFocus: false });
  const counterParams = { page: 1, per_page: 1 };
  const { total: projectsTotal, loading: projectsLoading, error: projectsError, refetch: refetchProjects } = useLrdResource(LRD_ENDPOINTS.projects, { params: { ...counterParams, scope: "mine" }, skip: !canLoadLrd, loadOnFocus: false });
  const { total: articlesTotal, loading: articlesLoading, error: articlesError, refetch: refetchArticles } = useLrdResource(LRD_ENDPOINTS.papers, { params: { ...counterParams, scope: "mine" }, skip: !canLoadLrd, loadOnFocus: false });
  const { total: otherProjectsTotal, loading: otherProjectsLoading, error: otherProjectsError, refetch: refetchOtherProjects } = useLrdResource(LRD_ENDPOINTS.projects, { params: { ...counterParams, scope: LRD_VISIBLE_SCOPE }, skip: !canLoadLrd, loadOnFocus: false });
  const { total: otherArticlesTotal, loading: otherArticlesLoading, error: otherArticlesError, refetch: refetchOtherArticles } = useLrdResource(LRD_ENDPOINTS.papers, { params: { ...counterParams, scope: LRD_VISIBLE_SCOPE }, skip: !canLoadLrd, loadOnFocus: false });

  useEffect(() => {
    if (!canLoadLrd) return undefined;
    return subscribeLrdChange((endpoint) => {
      if (endpoint === LRD_ENDPOINTS.projects) {
        void Promise.allSettled([
          refetchProjects({ force: true }),
          refetchOtherProjects({ force: true }),
        ]);
      } else if (endpoint === LRD_ENDPOINTS.papers) {
        void Promise.allSettled([
          refetchArticles({ force: true }),
          refetchOtherArticles({ force: true }),
        ]);
      } else if (endpoint === LRD_ENDPOINTS.educations) {
        // The focus refresh below only reloads education on the first visit for
        // a researcher, so without this an edit made later kept showing the old
        // qualification until the screen was remounted.
        void refetchEducation({ force: true });
      } else if (endpoint === LRD_ENDPOINTS.expertises) {
        void refetchExpertise({ force: true });
      }
    });
  }, [
    canLoadLrd,
    refetchArticles,
    refetchEducation,
    refetchExpertise,
    refetchOtherArticles,
    refetchOtherProjects,
    refetchProjects,
  ]);

  const refetchProfile = useCallback(async () => {
    if (!canLoadLrd) return;
    setProfileLoading(true);
    try {
      const res = await getLrd(LRD_ENDPOINTS.researcherMe);
      const raw = res.data?.data ?? res.data ?? {};
      setProfile({
        firstName: raw.firstName ?? raw.first_name ?? "",
        lastName: raw.lastName ?? raw.last_name ?? "",
        prefix: raw.prefix ?? "",
        faculty: String(raw.faculty?.id ?? raw.faculty_id ?? raw.faculty ?? ""),
        facultyName: raw.faculty?.name ?? "",
        department: String(raw.department?.id ?? raw.branch_id ?? raw.department ?? ""),
        departmentName: raw.department?.name ?? "",
        position: raw.position ?? "",
        email: raw.email ?? "",
        phone: raw.phone ?? raw.tel ?? "",
        lineId: raw.lineId ?? raw.line_id ?? "",
      });
    } catch (_) {}
    finally { setProfileLoading(false); }
  }, [canLoadLrd]);

  useFocusEffect(useCallback(() => {
    if (!canLoadLrd || !researcherId) return undefined;
    const counterRefreshes = [
      refetchProjects({ force: true }),
      refetchArticles({ force: true }),
      refetchOtherProjects({ force: true }),
      refetchOtherArticles({ force: true }),
    ];
    // Profile, education and expertise are refreshed on every focus, not only
    // the first visit for a researcher. Limiting them to the first visit meant
    // an edit made afterwards kept showing the previous values when returning
    // to this screen.
    const requests = [
      refetchProfile(),
      refetchEducation({ force: true }),
      refetchExpertise({ force: true }),
      ...counterRefreshes,
    ];
    Promise.allSettled(requests).catch(() => {});
    return undefined;
  }, [
    canLoadLrd,
    researcherId,
    refetchProfile,
    refetchEducation,
    refetchExpertise,
    refetchProjects,
    refetchArticles,
    refetchOtherProjects,
    refetchOtherArticles,
  ]));

  const loading = sessionLoading || (canLoadLrd && (profileLoading || educationLoading || expertiseLoading));
  const hasProfile = Boolean(profile.firstName?.trim() || profile.lastName?.trim());

  const handleConnect = async () => {
    try {
      const result = await connect();
      Alert.alert(
        te("home.connectSuccessTitle"),
        result.created ? te("home.connectCreated") : te("home.connectSynced"),
      );
    } catch (connectError) {
      Alert.alert(te("home.connectFailed"), connectError.message);
    }
  };

  return (
    <View className="flex-1 bg-[#edf5f1]">
      <StatusBar barStyle="light-content" backgroundColor="#174D42" />
      <AppHeader title="e-Research" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="bg-[#07865F] rounded-[20px] p-5 mb-5 overflow-hidden">
          <View className="w-24 h-24 rounded-full bg-white/10 absolute -right-5 -top-6" />
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-[14px] bg-white/15 items-center justify-center mr-3">
              <Ionicons name="flask-outline" size={25} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[20px] font-black">{te("home.heroTitle")}</Text>
              <Text className="text-[#cde8dc] text-[13px] mt-1">{te("home.heroSubtitle")}</Text>
            </View>
          </View>
          {!hasProfile && !loading && (
            <TouchableOpacity
              className="bg-white rounded-xl min-h-[44px] mt-4 px-4 flex-row items-center justify-center"
              onPress={() => navigation.navigate("ResearcherForm")}
              activeOpacity={0.82}
            >
              <Ionicons name="person-add-outline" size={18} color="#07865F" />
              <Text className="text-[#07865F] font-extrabold text-[14px] ml-2">{te("home.startProfile")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {!loading && sessionError ? (
          <View className="bg-white rounded-[20px] p-5 mb-5 items-center" style={{ elevation: 2 }}>
            <View className="w-12 h-12 rounded-full bg-[#fff0e8] items-center justify-center mb-3">
              <Ionicons name="cloud-offline-outline" size={23} color="#b65321" />
            </View>
            <Text className="text-[16px] font-black text-[#273a32] text-center">{te("home.sessionErrorTitle")}</Text>
            <Text className="text-[13px] text-[#5F7069] text-center mt-2">{sessionError}</Text>
            <TouchableOpacity className="min-h-[44px] bg-[#07865F] rounded-xl px-5 mt-4 flex-row items-center justify-center" onPress={retrySession} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={17} color="#fff" />
              <Text className="text-white text-[14px] font-bold ml-2">{te("home.retryConnect")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !sessionError && session?.authenticated && !connected ? (
          <View className="bg-white rounded-[20px] p-5 mb-5 items-center" style={{ elevation: 2 }}>
            <View className="w-12 h-12 rounded-full bg-[#e3f3eb] items-center justify-center mb-3">
              <Ionicons name="link-outline" size={23} color="#07865F" />
            </View>
            <Text className="text-[16px] font-black text-[#273a32] text-center">{te("home.connectTitle")}</Text>
            <Text className="text-[13px] text-[#5F7069] text-center mt-2">{te("home.connectDescription")}</Text>
            {connectError ? (
              <Text className="text-[13px] text-[#b65321] text-center mt-2">{connectError}</Text>
            ) : null}
            <TouchableOpacity
              className="min-h-[44px] bg-[#07865F] rounded-xl px-5 mt-4 flex-row items-center justify-center"
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.8}
              style={{ opacity: connecting ? 0.65 : 1 }}
            >
              {connecting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-add-outline" size={17} color="#fff" />}
              <Text className="text-white text-[14px] font-bold ml-2">
                {connecting ? te("home.connecting") : te("home.connectButton")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !sessionError && hasProfile && (
          <>
            <Text className="text-[13px] font-extrabold text-[#5F7069] uppercase mb-3">{te("home.researcherInfo")}</Text>
            <ResearcherSummary
              profile={profile}
              education={education}
              expertise={expertise}
              photoUrl={user?.photoUrl ?? ""}
              onEdit={() => navigation.navigate("ResearcherForm")}
              te={te}
            />
          </>
        )}

        {!sessionError && connected && <Text className="text-[13px] font-extrabold text-[#5F7069] uppercase mb-3">{te("home.manageData")}</Text>}
        {loading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#07865F" />
            <Text className="text-[13px] text-[#5F7069] mt-3">{te("home.loadingData")}</Text>
          </View>
        ) : !sessionError && connected ? (
          <>
            <MenuCard icon="person-outline" color="#07865F" background="#e3f3eb" title={te("home.profileTitle")} description={te("home.profileDescription")} onPress={() => navigation.navigate("ResearcherForm")} />
            <MenuCard icon="folder-open-outline" color="#185fa5" background="#e8f0fb" title={te("home.projectsTitle")} description={te("home.projectsDescription")} count={projectsLoading || projectsError ? undefined : projectsTotal} onPress={() => navigation.navigate("ProjectList")} />
            <MenuCard icon="document-text-outline" color="#b56a18" background="#fff3df" title={te("home.articlesTitle")} description={te("home.articlesDescription")} count={articlesLoading || articlesError ? undefined : articlesTotal} onPress={() => navigation.navigate("ArticleList")} />
            <MenuCard icon="print-outline" color="#6b3fa0" background="#f1e9fa" title={te("home.printTitle")} description={te("home.printDescription")} onPress={() => navigation.navigate("ProfilePrint")} />
            <Text className="text-[13px] font-extrabold text-[#5F7069] uppercase mt-2 mb-3">{te("home.searchData")}</Text>
            <MenuCard icon="search-outline" color="#0F7A55" background="#E7F4ED" title={te("home.searchProjectsTitle")} description={te("home.searchProjectsDescription")} count={otherProjectsLoading || otherProjectsError ? undefined : otherProjectsTotal} onPress={() => navigation.navigate("ProjectSearch", { mode: "search" })} />
            <MenuCard icon="search-outline" color="#68458C" background="#F3EEFA" title={te("home.searchArticlesTitle")} description={te("home.searchArticlesDescription")} count={otherArticlesLoading || otherArticlesError ? undefined : otherArticlesTotal} onPress={() => navigation.navigate("ArticleSearch", { mode: "search" })} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
