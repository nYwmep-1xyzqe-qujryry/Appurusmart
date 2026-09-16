import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppHeader from "../../components/AppHeader";
import StateView from "../../components/StateView";
import { stripNamePrefix } from "../../utils/name";
import { fixPhotoUrl } from "../../utils/image";
import { INFO_API_BASE_URL } from "../../config";
import infoApi from "../../services/infoApi";
import { colors, radius, shadows } from "../../theme/tokens";
import { getExpertGroupLabel } from "../../constants/expertGroups";

// ── Avatar ─────────────────────────────────────────────────
const Avatar = ({ name, photoUrl, index }) => {
  const initial = name?.replace(/^(อาจารย์|ดร\.|ผศ\.|รศ\.)\s*/, "").trim()?.[0] ?? "อ";
  return (
    <View style={{ position: "relative", flexShrink: 0 }}>
      <View style={{
        width: 76, height: 76, borderRadius: 38,
        overflow: "hidden",
        backgroundColor: "#c8e6d6",
        borderWidth: 2.5, borderColor: "#07865F",
        alignItems: "center", justifyContent: "center",
      }}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          : <Text style={{ fontSize: 28, fontWeight: "900", color: "#07865F" }}>{initial}</Text>
        }
      </View>
      {/* ลำดับ */}
      <View style={{
        position: "absolute", bottom: -2, right: -2,
        backgroundColor: "#07865F", borderRadius: 10,
        minWidth: 20, height: 20,
        paddingHorizontal: 5,
        alignItems: "center", justifyContent: "center",
        borderWidth: 2, borderColor: "#fff",
      }}>
        <Text style={{ fontSize: 11, fontWeight: "900", color: "#fff" }}>{index + 1}</Text>
      </View>
    </View>
  );
};

// ── Chip ───────────────────────────────────────────────────
const Chip = ({ label, color = "#07865F", bg = "#e6f4ef", border = "#9fd4bc" }) => (
  <View style={{ backgroundColor: bg, borderWidth: 1, borderColor: border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginRight: 5, marginBottom: 4 }}>
    <Text style={{ fontSize: 12, fontWeight: "700", color }} numberOfLines={1}>{label}</Text>
  </View>
);

const readRows = (response) => response.data?.data ?? response.data ?? [];

// สถานะ HTTP ที่ถือว่า backend ปฏิเสธ filter นี้ (ไม่ใช่ "ค้นหาไม่พบ") — ต้อง fallback
// ไปดึงข้อมูลแบบไม่ filter แล้วมากรองฝั่ง client แทน
const FILTER_UNSUPPORTED_STATUSES = [400, 404, 422, 500];

const fetchProfileSearch = async (params) => {
  const response = await infoApi.get("/info/expert/profile-search", {
    params,
    suppressErrorLog: true,
  });
  return readRows(response);
};

const toArray = (value) =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

const getInterestEntries = (item) => [
  ...toArray(item?.interests),
  ...toArray(item?.interest),
  ...toArray(item?.interest_names),
  ...toArray(item?.profile?.interests),
  ...toArray(item?.profile?.interest_names),
  ...toArray(item?.user?.interests),
];

const getInterestNames = (item) =>
  getInterestEntries(item)
    .map(
      (interest) =>
        interest?.name ??
        interest?.label ??
        interest?.interest_name ??
        interest?.interest_name_th ??
        interest?.interest_name_en ??
        interest,
    )
    .filter(Boolean);

const getInterestIds = (item) =>
  getInterestEntries(item)
    .map((interest) =>
      interest && typeof interest === "object"
        ? interest.id ?? interest.interest_id
        : undefined,
    )
    .filter((id) => id !== undefined && id !== null && id !== "");

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/^กลุ่ม/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

const filterRowsByInterest = (rows, interest, interestId) => {
  const idTarget = interestId === undefined || interestId === null ? "" : String(interestId);
  if (idTarget) {
    const matchedById = rows.filter((item) =>
      getInterestIds(item).some((id) => String(id) === idTarget),
    );
    if (matchedById.length > 0) return matchedById;
  }

  const target = normalizeText(interest);
  if (!target) return [];

  return rows.filter((item) =>
    getInterestNames(item).some((name) => normalizeText(name) === target),
  );
};

const getExpertiseNames = (item) => {
  const expertises = Array.isArray(item?.expertises) ? item.expertises : [];
  return expertises
    .map((e) => {
      if (e?.name || e?.label || e?.expertise_name) {
        return e.name ?? e.label ?? e.expertise_name;
      }
      if (e?.group_id) return getExpertGroupLabel(e.group_id);
      return e;
    })
    .filter(Boolean);
};

const getExpertiseGroupIds = (item) => {
  const expertises = Array.isArray(item?.expertises) ? item.expertises : [];
  return expertises
    .map((e) => e?.group_id ?? e?.expertise_group_id)
    .filter((id) => id !== undefined && id !== null && id !== "");
};

const filterRowsByExpertise = (rows, expertise, groupId) => {
  const groupTarget = groupId ? String(groupId) : "";
  if (groupTarget) {
    const matchedByGroupId = rows.filter((item) =>
      getExpertiseGroupIds(item).some((id) => String(id) === groupTarget),
    );
    if (matchedByGroupId.length > 0) return matchedByGroupId;
  }

  const target = normalizeText(expertise);
  if (!target) return rows;

  return rows.filter((item) =>
    getExpertiseNames(item).some((name) => normalizeText(name) === target),
  );
};

// ค้นหาด้วยความสนใจ: ให้ backend filter ก่อน (search_by=interest ใช้ mechanism
// เดียวกับ keyword search ปกติ) ถ้า backend ปฏิเสธ filter นี้ (400/404/422/500)
// ค่อย fallback ไปดึงข้อมูลทั้งหมดมากรองฝั่ง client จาก profile.interests แทน
const fetchInterestSearch = async ({ keyword, interest_id: interestId }) => {
  try {
    return await fetchProfileSearch({
      search_by: "interest",
      keyword,
      ...(interestId ? { interest_id: interestId } : {}),
    });
  } catch (error) {
    const status = error?.response?.status;
    if (!FILTER_UNSUPPORTED_STATUSES.includes(status)) throw error;

    if (__DEV__) {
      console.log(
        "[ResearchList] interest filter unsupported by backend, falling back to client-side filter:",
        { status, endpoint: "/profile-search" },
      );
    }

    const allRows = await fetchProfileSearch({});
    return filterRowsByInterest(allRows, keyword, interestId);
  }
};

const fetchProfileSearchWithFallback = async (searchParams) => {
  if (searchParams?.search_by === "interest" && searchParams?.keyword) {
    return fetchInterestSearch(searchParams);
  }

  const rows = await fetchProfileSearch(searchParams);

  if (!searchParams?.expertise && !searchParams?.expertise_group_id) {
    return rows;
  }

  const filteredRows = filterRowsByExpertise(
    rows,
    searchParams.expertise,
    searchParams.expertise_group_id ?? searchParams.group_id,
  );
  if (filteredRows.length > 0) return filteredRows;

  const keyword = searchParams.expertise;
  const groupId = searchParams.expertise_group_id ?? searchParams.group_id;
  const fallbacks = [
    { expertise_group_id: groupId },
    { group_id: groupId },
    { search_by: "expertise", keyword },
    { search_by: "expertise_group", keyword },
    { expertise_group: keyword },
    { expert_group: keyword },
  ];

  for (const params of fallbacks) {
    const fallbackRows = await fetchProfileSearch(params);
    const filteredFallbackRows = filterRowsByExpertise(fallbackRows, keyword, groupId);
    if (__DEV__) {
      console.log(
        "[ResearchList] expertise fallback:",
        params,
        fallbackRows.length,
        "→ filtered:",
        filteredFallbackRows.length,
      );
    }
    if (filteredFallbackRows.length > 0) return filteredFallbackRows;
  }

  return filteredRows;
};

// ── ExpertCard ─────────────────────────────────────────────
const ExpertCard = ({ item, index, onPress }) => {
  const { t } = useTranslation();
  const name      = stripNamePrefix(item.full_name_th ?? item.full_name_en ?? item.name ?? item.full_name ?? "");
  const position  = item.position ?? item.academic_position ?? "";
  const faculty   = item.faculty_name_th ?? item.department_name_th ?? item.faculty ?? item.faculty_name ?? "";
  const dept      = item.department_name_th ?? item.unit_name_th ?? "";
  // profile-search ต้องใช้เฉพาะ URL เต็มที่ backend ส่งกลับมาเท่านั้น
  // ค่า legacy ที่เป็นชื่อไฟล์ล้วนจะถูกละทิ้งและแสดง avatar เริ่มต้น
  const rawPhoto = [
    item.picture_url, item.photo_url, item.photoUrl, item.photo,
    item.profile_photo_url, item.profile_image, item.profile_picture,
    item.image_url, item.image, item.picture, item.avatar,
    item.profile?.picture_url, item.profile?.photo_url, item.profile?.picture,
    item.user?.picture_url, item.user?.photo_url, item.user?.profile_picture,
    item.user?.image_url, item.user?.picture, item.user?.photo,
  ].find((value) => /^https?:\/\//i.test(String(value ?? "").trim())) ?? "";
  const photoUrl = fixPhotoUrl(rawPhoto, INFO_API_BASE_URL);
  if (__DEV__) {
    console.log("[ResearchList] photo URL:", photoUrl || "<default-avatar>");
    if (!photoUrl) {
      console.log("[ResearchList] photo fields:", {
        picture: item.picture ?? null,
        photo_url: item.photo_url ?? null,
        picture_url: item.picture_url ?? null,
        profile_picture: item.profile_picture ?? null,
        user_picture: item.user?.picture ?? null,
      });
    }
  }
  const expertises = (item.expertises ?? []).map((e) => e.name ?? e.label ?? String(e)).filter(Boolean);
  const interests  = (item.interests  ?? []).map((e) => e.name ?? e.label ?? String(e)).filter(Boolean);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        marginBottom: 12,
        overflow: "hidden",
        ...shadows.card,
      }}
    >
      {/* Green top border */}
      <View style={{ height: 3, backgroundColor: "#07865F" }} />

      <View style={{ padding: 14, gap: 12 }}>
        {/* Row 1: Avatar + Info */}
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <Avatar name={name} photoUrl={photoUrl} index={index} />

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#0a1a12", lineHeight: 24, letterSpacing: 0 }} numberOfLines={2}>
              {name || "—"}
            </Text>

            {!!position && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: "#e6f4ef", borderWidth: 1, borderColor: "#9fd4bc", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 }}>
                <Ionicons name="ribbon-outline" size={11} color="#07865F" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#07865F" }} numberOfLines={1}>{position}</Text>
              </View>
            )}

            {!!(faculty || dept) && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 5 }}>
                <Ionicons name="business-outline" size={12} color="#a0b8b0" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: "#5a7a6e", flex: 1, lineHeight: 18 }} numberOfLines={2}>
                  {[faculty, dept !== faculty ? dept : ""].filter(Boolean).join("  ·  ")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: "#eef4f1" }} />

        {/* Row 2: Expertise + Interest chips */}
        <View style={{ gap: 8 }}>
          {/* ความเชี่ยวชาญ */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "#07865F", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="settings-sharp" size={11} color="#fff" />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#174D42", letterSpacing: 0 }}>{t("research.screen.expertiseLabel")}</Text>
            </View>
            {expertises.length > 0
              ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {expertises.slice(0, 4).map((tag, i) => <Chip key={i} label={tag} />)}
                  {expertises.length > 4 && <Chip label={`+${expertises.length - 4}`} color="#6b8f80" bg="#f0f8f4" border="#c4ddd5" />}
                </View>
              : <Text style={{ fontSize: 13, color: colors.textSoft, fontStyle: "italic", marginLeft: 2 }}>—</Text>
            }
          </View>

          {/* ความสนใจ */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="star" size={11} color="#fff" />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#92600a", letterSpacing: 0 }}>{t("research.screen.interestLabel")}</Text>
            </View>
            {interests.length > 0
              ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {interests.slice(0, 4).map((tag, i) => <Chip key={i} label={tag} color="#92600a" bg="#fff8e7" border="#f5c842" />)}
                  {interests.length > 4 && <Chip label={`+${interests.length - 4}`} color="#b08050" bg="#fffaf0" border="#e8d0a0" />}
                </View>
              : <Text style={{ fontSize: 13, color: colors.textSoft, fontStyle: "italic", marginLeft: 2 }}>—</Text>
            }
          </View>
        </View>

        {/* Row 3: CTA button */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: "#07865F", borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 8,
          }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>{t("research.screen.viewExpert")}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Screen ─────────────────────────────────────────────────
export default function ResearchList({ navigation, route }) {
  const { t } = useTranslation();
  const { searchParams = {} } = route?.params || {};

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  const runSearch = useCallback(async (cancelledRef) => {
    try {
      setLoading(true);
      setError(null);
      const rows = await fetchProfileSearchWithFallback(searchParams);
      if (!cancelledRef.current) setResults(rows);
    } catch (e) {
      if (__DEV__) {
        // ห้าม log token/Authorization header — เก็บแค่ status, endpoint และ params
        console.warn("[ResearchList] profile-search failed:", {
          status: e?.response?.status ?? e?.code ?? "NETWORK_ERROR",
          endpoint: "/profile-search",
          searchParams,
        });
      }
      if (!cancelledRef.current) setError(t("research.list.errorMessage"));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [searchParams, t]);

  useEffect(() => {
    const cancelledRef = { current: false };
    runSearch(cancelledRef);
    return () => { cancelledRef.current = true; };
  }, [runSearch, retryToken]);

  const handleRetry = () => setRetryToken((prev) => prev + 1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <AppHeader title={t("research.screen.expertList")} onBack={() => navigation.goBack()} />

      {/* Content */}
      {loading ? (
        <StateView type="loading" title={t("research.common.loading")} />
      ) : error ? (
        <StateView
          type="error"
          title={t("research.list.errorTitle")}
          message={error}
          actionLabel={t("research.list.retry")}
          onAction={handleRetry}
        />
      ) : results.length === 0 ? (
        <StateView icon="search-outline" title={t("research.list.noData")} message={t("research.list.desc")} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.id ?? i}`}
          ListHeaderComponent={
            <Text style={{ fontSize: 13, color: "#5F7069", fontWeight: "600", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}>
              {t("research.screen.foundCount", { count: results.length })}
            </Text>
          }
          renderItem={({ item, index }) => (
            <ExpertCard
              item={item}
              index={index}
              onPress={() => navigation.navigate("ProfileDetail", { id: item.id })}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}
