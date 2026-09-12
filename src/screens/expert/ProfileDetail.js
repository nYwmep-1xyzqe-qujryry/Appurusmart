import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Image, Linking,
  Platform, ScrollView, Text, TouchableOpacity, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import AppHeader from "../../components/AppHeader";
import StateView from "../../components/StateView";
import { stripNamePrefix } from "../../utils/name";
import { fixPhotoUrl } from "../../utils/image";
import { getExpertLink, getExpertTitle, getExpertYear } from "../../utils/expertFields";
import infoApi from "../../services/infoApi";
import { API_BASE_URL, INFO_API_BASE_URL, STORAGE_KEYS } from "../../config";
import { getAuthToken } from "../../services/authStorage";
import useRefs from "../../hook/useRefs";
import { colors } from "../../theme/tokens";

const DEGREE_KEYS = {
  "1": "research.profileDetail.degreeLow",
  "2": "research.profileDetail.degreeBach",
  "3": "research.profileDetail.degreeMaster",
  "4": "research.profileDetail.degreeDoctor",
};

const findRefLabel = (items, value) => {
  if (value === undefined || value === null || value === "") return "";
  const found = items.find((item, index) => {
    const id = item.id ?? item.type_id ?? item.level_id ?? item.pmu_id ??
      item.research_type_id ?? item.research_level_id ?? item.research_pmu_type_id ?? index;
    return String(id) === String(value);
  });
  return found?.name ?? found?.label ?? found?.type_name ?? found?.level_name ?? found?.pmu_name ?? found?.title ?? "";
};

const researchTitle = (r) =>
  r.name ?? r.title ?? r.research_name ?? r.research_title ?? r.research?.name ?? r.research?.title ?? "";

const researchTypeId = (r) => r.research_type_id ?? r.type_id ?? r.research_type?.id ?? r.type?.id ?? "";
const researchPmuId = (r) => r.research_PMU_type_id ?? r.research_pmu_type_id ?? r.pmu_id ?? r.research_PMU_type?.id ?? r.research_pmu_type?.id ?? "";
const researchLevelId = (r) => r.research_level_id ?? r.level_id ?? r.research_level?.id ?? r.level?.id ?? "";

const researchTypeLabel = (r, refs) =>
  r.research_type?.name ?? r.type?.name ?? r.research_type_name ?? r.type_name ?? findRefLabel(refs, researchTypeId(r));

const researchPmuLabel = (r, refs) =>
  r.research_pmu_type?.name ?? r.research_PMU_type?.name ?? r.pmu_type?.name ??
  r.research_pmu_type_name ?? r.research_PMU_type_name ?? r.pmu_name ?? findRefLabel(refs, researchPmuId(r));

const researchLevelLabel = (r, refs) =>
  r.research_level?.name ?? r.level?.name ?? r.research_level_name ?? r.level_name ?? findRefLabel(refs, researchLevelId(r));

// ── Helpers ────────────────────────────────────────────────
const openLink = (url) => { if (url) Linking.openURL(url).catch(() => {}); };

// arraybuffer → base64 (ทำงานได้กับไฟล์ใหญ่โดยไม่ stack overflow)
const uint8ToBase64 = (bytes) => {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const waitForImages = async (element) => {
  const images = Array.from(element.querySelectorAll("img"));

  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();

    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  }));
};

const enhanceProfilePdfHtml = (html) => {
  const alignedHtml = html.replace(
    /(<tr[^>]*>\s*)(<td[^>]*>\s*(?:<[^>]+>\s*)*โทรศัพท์\s*:?\s*(?:<\/[^>]+>\s*)*<\/td>\s*<td\b)/gi,
    "$1<td></td>$2",
  );
  const style = `
    <style>
      .profile-photo,
      .profile-image,
      .avatar,
      .photo {
        min-width: 195px !important;
      }

      .profile-photo img,
      .profile-image img,
      .avatar img,
      .photo img,
      img[src*="photo"],
      img[src*="profile"],
      img[src*="picture"],
      img[src*="avatar"],
      img[src*="storage"] {
        width: 180px !important;
        max-width: 180px !important;
        height: auto !important;
        max-height: 135px !important;
        object-fit: cover !important;
      }

      td:has(img) {
        min-width: 195px !important;
      }

      td:has(img) img {
        width: 180px !important;
        max-width: 180px !important;
        height: auto !important;
        max-height: 135px !important;
        object-fit: cover !important;
      }
    </style>
  `;

  if (/<\/head>/i.test(alignedHtml)) {
    return alignedHtml.replace(/<\/head>/i, `${style}</head>`);
  }

  return `${style}${alignedHtml}`;
};

const downloadProfilePdfWeb = async (userId) => {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/profile/${userId}/pdf`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`PDF HTML request failed: ${response.status}`);
  }

  const htmlContent = await response.text();
  const element = document.createElement("div");

  element.innerHTML = enhanceProfilePdfHtml(htmlContent);
  element.style.width = "794px";
  element.style.background = "#fff";
  element.style.position = "absolute";
  element.style.left = "-10000px";
  element.style.top = "0";

  document.body.appendChild(element);

  try {
    await waitForImages(element);

    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default ?? html2pdfModule;
    const options = {
      margin: 10,
      filename: "profile.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      },
      jsPDF: {
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      },
    };

    await html2pdf().set(options).from(element).save();
  } finally {
    document.body.removeChild(element);
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPdfRows = (cols, rows) => `
  <table>
    <thead>
      <tr>
        ${cols.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${row.map((cell) => `<td>${escapeHtml(cell || "-")}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  </table>
`;

const renderPdfSection = ({ title, cols, rows }) => {
  if (!rows?.length) return "";
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${renderPdfRows(cols, rows)}
    </section>
  `;
};

const renderPdfTags = (title, values) => {
  if (!values?.length) return "";
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <p class="tag-line">${values.map(escapeHtml).join(", ")}</p>
    </section>
  `;
};

const buildProfilePdfHtml = ({
  title,
  name,
  position,
  faculty,
  dept,
  email,
  phone,
  photoUrl,
  expertises,
  interests,
  sections,
}) => `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { margin: 14mm 10mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
          color: #111827;
          font-size: 11px;
          line-height: 1.45;
        }
        h1 {
          text-align: center;
          font-size: 17px;
          margin: 0 0 14px;
        }
        h2 {
          font-size: 12px;
          margin: 14px 0 7px;
          color: #222;
        }
        .profile {
          display: table;
          width: 100%;
          margin-bottom: 12px;
        }
        .photo-wrap {
          display: table-cell;
          width: 178px;
          vertical-align: top;
        }
        .photo {
          width: 160px;
          height: 120px;
          object-fit: cover;
          border: 1px solid #d1d5db;
        }
        .info {
          display: table-cell;
          vertical-align: top;
          padding-left: 12px;
        }
        .info-title {
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .row {
          display: table-row;
        }
        .label,
        .value {
          display: table-cell;
          padding: 2px 0;
        }
        .label {
          width: 90px;
          font-weight: 700;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-bottom: 7px;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th,
        td {
          border: 1px solid #666;
          padding: 5px 6px;
          vertical-align: top;
          word-break: break-word;
        }
        th {
          font-weight: 700;
          text-align: center;
          background: #f7f7f7;
        }
        section {
          page-break-inside: auto;
        }
        .tag-line {
          margin: 0 0 8px;
        }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <div class="profile">
        <div class="photo-wrap">
          ${photoUrl ? `<img class="photo" src="${escapeHtml(photoUrl)}" />` : ""}
        </div>
        <div class="info">
          <div class="info-title">${escapeHtml(name || "-")}</div>
          <div class="row"><div class="label">ตำแหน่ง:</div><div class="value">${escapeHtml(position || "-")}</div></div>
          <div class="row"><div class="label">คณะ:</div><div class="value">${escapeHtml(faculty || "-")}</div></div>
          <div class="row"><div class="label">สาขา:</div><div class="value">${escapeHtml(dept || "-")}</div></div>
          <div class="row"><div class="label">อีเมล:</div><div class="value">${escapeHtml(email || "-")}</div></div>
          <div class="row"><div class="label">โทรศัพท์:</div><div class="value">${escapeHtml(phone || "-")}</div></div>
        </div>
      </div>
      ${renderPdfTags("ความเชี่ยวชาญ", expertises)}
      ${renderPdfTags("ความสนใจ", interests)}
      ${sections.map(renderPdfSection).join("")}
    </body>
  </html>
`;

// ── Chip ───────────────────────────────────────────────────
const Tag = ({ label, bg = "#e8f5ee", border = "#9fd4bc", color = "#007a5a" }) => (
  <View style={{ backgroundColor: bg, borderWidth: 1, borderColor: border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, marginRight: 6, marginBottom: 6 }}>
    <Text style={{ fontSize: 12, fontWeight: "700", color }}>{label}</Text>
  </View>
);

// ── Section icon circle ────────────────────────────────────
const SectionIcon = ({ name, color = "#fff", bg = "#007a5a" }) => (
  <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
    <Ionicons name={name} size={16} color={color} />
  </View>
);

// ── Count badge ────────────────────────────────────────────
const Badge = ({ n }) => (
  <View style={{ backgroundColor: n > 0 ? "#007a5a" : "#bbc9c2", borderRadius: 99, minWidth: 26, paddingHorizontal: 7, paddingVertical: 2, alignItems: "center" }}>
    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{n}</Text>
  </View>
);

// ── Always-open section ────────────────────────────────────
const FlatSection = ({ icon, iconBg, title, children }) => (
  <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#dde8e2", marginBottom: 12, overflow: "hidden", elevation: 1 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f2f9f5", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#dde8e2" }}>
      <SectionIcon name={icon} bg={iconBg} />
      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0a3d25" }}>{title}</Text>
    </View>
    <View style={{ padding: 14 }}>{children}</View>
  </View>
);

// ── Accordion section ─────────────────────────────────────
const Section = ({ icon, iconBg, title, count, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const anim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(anim, { toValue: next ? 1 : 0, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
  };
  const rot = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#dde8e2", marginBottom: 10, overflow: "hidden", elevation: 1 }}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f2f9f5", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: open ? 1 : 0, borderBottomColor: "#dde8e2" }}>
        <SectionIcon name={icon} bg={iconBg} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "800", color: "#0a3d25" }}>{title}</Text>
        <Badge n={count ?? 0} />
        <Animated.View style={{ transform: [{ rotate: rot }], marginLeft: 4 }}>
          <Ionicons name="chevron-down" size={15} color="#6b8f80" />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={{ padding: 14 }}>{children}</View>}
    </View>
  );
};

// ── Info row (ข้อมูลส่วนตัว) ───────────────────────────────
const InfoRow = ({ icon, label, value, isEmail }) => {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 7, gap: 7 }}>
      <Ionicons name={icon} size={13} color="#007a5a" style={{ marginTop: 2 }} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#007a5a", minWidth: 70 }}>{label}</Text>
      {isEmail
        ? <TouchableOpacity onPress={() => openLink(`mailto:${value}`)}>
            <Text style={{ fontSize: 12, color: "#007a5a", fontWeight: "600", textDecorationLine: "underline" }}>{value}</Text>
          </TouchableOpacity>
        : <Text style={{ fontSize: 12, color: "#1a2820", flex: 1, lineHeight: 18, fontWeight: "500" }}>{value}</Text>
      }
    </View>
  );
};

// ── Empty state ────────────────────────────────────────────
const Empty = () => {
  const { t } = useTranslation();
  return (
    <View style={{ alignItems: "center", paddingVertical: 18, gap: 5 }}>
      <Ionicons name="folder-open-outline" size={28} color="#c0cec7" />
      <Text style={{ fontSize: 12, color: "#a0afaa", fontWeight: "500" }}>{t("research.profileDetail.noInfo")}</Text>
    </View>
  );
};

// ── Table ──────────────────────────────────────────────────
// col: { w, label, isLink?, isCenter? }
// rows: array of arrays (string | null)
const DataTable = ({ cols, rows }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    <View style={{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#deeee6" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", backgroundColor: "#e6f4ef", paddingVertical: 9, paddingHorizontal: 4 }}>
        {cols.map((c, i) => (
          <Text key={i} style={{ fontSize: 11, fontWeight: "800", color: "#00614a", width: c.w, paddingHorizontal: 6, textAlign: (c.isCenter || i === 0) ? "center" : "left", letterSpacing: 0.2 }}>
            {c.label}
          </Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", paddingVertical: 9, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: "#eef3f0", backgroundColor: colors.rowBg, alignItems: "flex-start" }}>
          {cols.map((c, ci) => {
            const val = row[ci] ?? "";
            if (c.isLink && val) {
              return (
                <TouchableOpacity key={ci} style={{ width: c.w, paddingHorizontal: 6 }} onPress={() => openLink(val)} activeOpacity={0.7}>
                  <Text style={{ fontSize: 12, color: "#007a5a", fontWeight: "600", textDecorationLine: "underline" }} numberOfLines={2}>{val}</Text>
                </TouchableOpacity>
              );
            }
            return (
              <Text key={ci} numberOfLines={ci === 0 ? 1 : 4}
                style={{ fontSize: 12, width: c.w, paddingHorizontal: 6, lineHeight: 18, textAlign: (c.isCenter || ci === 0) ? "center" : "left", color: ci === 0 ? "#007a5a" : "#1a2820", fontWeight: ci === 0 ? "800" : "500" }}>
                {val}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  </ScrollView>
);

// ── Main ──────────────────────────────────────────────────
export default function ProfileDetail({ navigation, route }) {
  const { id } = route?.params ?? {};
  const { t } = useTranslation();
  const { researchTypes, researchLevels, researchPmuTypes } = useRefs();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const degreeLabel = (e) => {
    const key = DEGREE_KEYS[String(e.degree_id ?? e.degree ?? "")];
    return e.degree_name ?? e.education_level ?? e.level ?? (key ? t(key) : "");
  };

  const fetchProfile = useCallback(async () => {
    if (!id) { setError(t("research.profileDetail.notFound")); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      if (__DEV__) {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        const me = raw ? JSON.parse(raw) : {};
        console.log("=== [ProfileDetail] profile id:", id, "| login id:", me.id ?? me.user_id ?? "N/A", "===");
      }
      const res = await infoApi.get(`/info/expert/profile/${id}`);
      const data = res.data?.data?.profile ?? res.data?.data ?? res.data;
      if (__DEV__) {
        const rels = ["expertises","interests","educations","workexes","boardexes",
          "researches","journals","proceedings","hsps","books","patents",
          "awards","lecturers","trainings","academics"];
        rels.forEach((k) => {
          const arr = data?.[k];
          if (Array.isArray(arr) && arr.length > 0) console.log(`[ProfileDetail] ${k}(${arr.length}) sample:`, JSON.stringify(arr[0]));
          else console.log(`[ProfileDetail] ${k}: ${Array.isArray(arr) ? 0 : "MISSING"}`);
        });
      }
      setProfile(data);
    } catch (e) {
      if (__DEV__) {
        console.warn("[ProfileDetail]", e?.response?.status, e?.message);
      }
      const s = e?.response?.status;
      if (s === 404) setError(t("research.profileDetail.notFound"));
      else if (s === 401 || s === 403) setError(t("research.profileDetail.noAccess"));
      else if (!e?.response) setError(t("research.profileDetail.noConnect"));
      else setError(t("research.profileDetail.loadFailRetry"));
    } finally { setLoading(false); }
  }, [id, t]);

  // refetch ทุกครั้งที่กลับมาโฟกัสหน้านี้ (เช่น goBack จากหน้าแก้ไข
  // ความเชี่ยวชาญ/การศึกษา) ไม่ใช่แค่ตอน mount ครั้งแรก — เหมือน pattern
  // ที่ ExpertHome.js ใช้กับ useMenuCounts
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile]),
  );

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <AppHeader title={t("research.profileDetail.title")} onBack={() => navigation.goBack()} />
      <StateView type="loading" title={t("research.profileDetail.loading")} />
    </View>
  );

  if (error || !profile) return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <AppHeader title={t("research.profileDetail.title")} onBack={() => navigation.goBack()} />
      <View style={{ flex: 1 }}>
        <StateView
          type="error"
          icon="person-circle-outline"
          title={t("research.profileDetail.loadFail")}
          message={error ?? t("research.profileDetail.genericError")}
          actionLabel={t("research.profileDetail.retry")}
          onAction={fetchProfile}
        />
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 13, color: colors.textSoft, fontWeight: "600", textAlign: "center" }}>{t("research.profileDetail.back")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Field extraction ───────────────────────────────────────
  const name      = stripNamePrefix(profile.full_name_th ?? profile.full_name_en ?? profile.name ?? "");
  const nameEn    = profile.full_name_en ?? "";
  const position  = profile.position ?? profile.academic_position ?? "";
  const faculty   = profile.faculty_name_th ?? profile.faculty ?? "";
  const dept      = profile.department_name_th ?? profile.unit_name_th ?? "";
  const rawPhoto = [
    profile.picture_url, profile.photo_url, profile.photoUrl, profile.photo,
    profile.profile_photo_url, profile.profile_image, profile.image_url,
    profile.picture, profile.avatar, profile.profile_picture,
    profile.profile?.picture_url, profile.profile?.photo_url, profile.profile?.picture,
    profile.user?.picture_url, profile.user?.photo_url, profile.user?.picture, profile.user?.photo,
  ].find((value) => /^https?:\/\//i.test(String(value ?? "").trim())) ?? "";
  const photoUrl = fixPhotoUrl(rawPhoto, INFO_API_BASE_URL);
  if (__DEV__) console.log("[ProfileDetail] photo URL:", photoUrl || "<default-avatar>");
  const email     = profile.email ?? "";
  const phone     = profile.phone ?? profile.phone_work ?? profile.phone_number ?? profile.tel ?? "";
  const affil     = [faculty, dept && dept !== faculty ? dept : ""].filter(Boolean).join(" · ");

  const expertises  = profile.expertises  ?? [];
  const interests   = profile.interests   ?? [];
  const educations  = profile.educations  ?? [];
  const workexes    = profile.workexes    ?? [];
  const boardexes   = profile.boardexes   ?? [];
  const researches  = profile.researches  ?? [];
  const journals    = profile.journals    ?? [];
  const proceedings = profile.proceedings ?? [];
  const hsps        = profile.hsps        ?? [];
  const books       = profile.books       ?? [];
  const patents     = profile.patents     ?? [];
  const awards      = profile.awards      ?? [];
  const lecturers   = profile.lecturers   ?? [];
  const trainings   = profile.trainings   ?? [];
  const academics   = profile.academics   ?? [];

  // ── Column definitions ─────────────────────────────────────
  const p = "research.profileDetail";
  const cEdu = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 110, label: t(`${p}.colEduDegree`) },
    { w: 140, label: t(`${p}.colEduField`) },
    { w: 150, label: t(`${p}.colEduInstitution`) },
    { w: 60, label: t(`${p}.colEduYear`) },
  ];
  const cWork = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 140, label: t(`${p}.colWorkPosition`) },
    { w: 150, label: t(`${p}.colWorkPlace`) },
    { w: 65, label: t(`${p}.colWorkStart`), isCenter: true },
    { w: 65, label: t(`${p}.colWorkEnd`), isCenter: true },
  ];
  const cAdmin = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 150, label: t(`${p}.colAdminPosition`) },
    { w: 140, label: t(`${p}.colWorkPlace`) },
    { w: 65, label: t(`${p}.colWorkStart`), isCenter: true },
    { w: 65, label: t(`${p}.colWorkEnd`), isCenter: true },
  ];
  const cResearch = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 260, label: t(`${p}.colResearchTitle`) },
    { w: 90, label: t(`${p}.colResearchType`) },
    { w: 100, label: t(`${p}.colResearchPmu`) },
    { w: 80, label: t(`${p}.colResearchLevel`) },
  ];
  const cJournal = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 320, label: t(`${p}.colRef`) },
    { w: 90, label: t(`${p}.colDatabase`) },
  ];
  const cProceeding = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 360, label: t(`${p}.colRef`) },
  ];
  const cHsp = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 300, label: t(`${p}.colTopic`) },
    { w: 130, label: t(`${p}.colFileLink`), isLink: true },
  ];
  const cBook = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 380, label: t(`${p}.colBookTitle`) },
  ];
  const cPatent = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 280, label: t(`${p}.colPatentTitle`) },
    { w: 130, label: t(`${p}.colFileLink`), isLink: true },
  ];
  const cAward = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 400, label: t(`${p}.colAwardTitle`) },
  ];
  const cLecturer = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 400, label: t(`${p}.colLecturerTopic`) },
  ];
  const cTraining = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 400, label: t(`${p}.colLecturerTopic`) },
  ];
  const cAcademic = [
    { w: 30, label: t(`${p}.colNo`) },
    { w: 55, label: t(`${p}.colYear`), isCenter: true },
    { w: 300, label: t(`${p}.colAcademicTitle`) },
    { w: 130, label: t(`${p}.colLink`), isLink: true },
  ];

  // ── Row builders ───────────────────────────────────────────
  const rEdu = educations.map((e, i) => [
    i + 1,
    degreeLabel(e),
    e.course ?? e.major ?? e.field ?? "",
    e.university ?? e.institution_name_th ?? e.institution ?? "",
    e.year ?? e.graduation_year ?? "",
  ]);
  const rWork = workexes.map((w, i) => [i + 1, w.position ?? "", w.workplace ?? w.place ?? "", w.year_start ?? "", w.year_end ?? ""]);
  const rAdmin = boardexes.map((a, i) => [i + 1, a.position ?? "", a.workplace ?? a.place ?? "", a.year_start ?? "", a.year_end ?? ""]);
  const rResearch = researches.map((r, i) => [
    i + 1,
    r.year ?? "",
    researchTitle(r),
    researchTypeLabel(r, researchTypes),
    researchPmuLabel(r, researchPmuTypes),
    researchLevelLabel(r, researchLevels),
  ]);
  const rJournal = journals.map((j, i) => [
    i + 1,
    getExpertYear(j),
    getExpertTitle(j),
    j.journal_type?.name ?? j.journal_type_name ?? j.database_name ?? "",
  ]);
  const rProceeding = proceedings.map((p, i) => [i + 1, getExpertYear(p), getExpertTitle(p)]);
  const rHsp = hsps.map((h, i) => [i + 1, getExpertYear(h), getExpertTitle(h), getExpertLink(h)]);
  const rBook = books.map((b, i) => [i + 1, getExpertYear(b), getExpertTitle(b)]);
  const rPatent = patents.map((p, i) => [i + 1, getExpertYear(p), getExpertTitle(p), getExpertLink(p)]);
  const rAward = awards.map((a, i) => [i + 1, getExpertYear(a), getExpertTitle(a)]);
  const rLecturer = lecturers.map((l, i) => [i + 1, getExpertYear(l), getExpertTitle(l)]);
  const rTraining = trainings.map((tr, i) => [i + 1, getExpertYear(tr), getExpertTitle(tr)]);
  const rAcademic = academics.map((a, i) => [i + 1, getExpertYear(a), getExpertTitle(a), getExpertLink(a)]);

  const handleDownloadPdf = async () => {
    if (!id || pdfLoading) return;
    setPdfLoading(true);
    try {
      if (Platform.OS === "web") {
        await downloadProfilePdfWeb(id);
        return;
      }

      const html = buildProfilePdfHtml({
        title: t(`${p}.title`),
        name,
        position,
        faculty,
        dept,
        email,
        phone,
        photoUrl,
        expertises: expertises.map((e) => e.name ?? e.label ?? String(e)).filter(Boolean),
        interests: interests.map((e) => e.name ?? e.label ?? String(e)).filter(Boolean),
        sections: [
          { title: t(`${p}.secEducation`), cols: cEdu, rows: rEdu },
          { title: t(`${p}.secWork`), cols: cWork, rows: rWork },
          { title: t(`${p}.secAdmin`), cols: cAdmin, rows: rAdmin },
          { title: t(`${p}.secResearch`), cols: cResearch, rows: rResearch },
          { title: t(`${p}.secJournal`), cols: cJournal, rows: rJournal },
          { title: t(`${p}.secProceeding`), cols: cProceeding, rows: rProceeding },
          { title: t(`${p}.secHumanSubjects`), cols: cHsp, rows: rHsp },
          { title: t(`${p}.secBooks`), cols: cBook, rows: rBook },
          { title: t(`${p}.secPatents`), cols: cPatent, rows: rPatent },
          { title: t(`${p}.secAwards`), cols: cAward, rows: rAward },
          { title: t(`${p}.secSpeakers`), cols: cLecturer, rows: rLecturer },
          { title: t(`${p}.secTrainings`), cols: cTraining, rows: rTraining },
          { title: t(`${p}.secServices`), cols: cAcademic, rows: rAcademic },
        ],
      });
      const { uri } = await Print.printToFileAsync({ html });
      const fileUri = FileSystem.cacheDirectory + "profile.pdf";
      await FileSystem.copyAsync({ from: uri, to: fileUri });
      await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    } catch (e) {
      console.warn("[ProfileDetail] PDF error:", e?.message);
      Alert.alert(t("research.profileDetail.downloadPdf"), t("research.profileDetail.pdfError"));
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f0f5f2" }}>
      <AppHeader title={t(`${p}.title`)} onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 13, paddingBottom: 60 }}>

        {/* ── Info card ── */}
        <View style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#dde8e2", marginBottom: 14, overflow: "hidden", elevation: 2 }}>
          <View style={{ height: 4, backgroundColor: "#007a5a" }} />

          <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
            <TouchableOpacity onPress={handleDownloadPdf} disabled={pdfLoading} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#e8f5ee", borderWidth: 1, borderColor: "#9fd4bc", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, opacity: pdfLoading ? 0.6 : 1 }}>
              {pdfLoading
                ? <ActivityIndicator size={13} color="#007a5a" />
                : <Ionicons name="document-text-outline" size={13} color="#007a5a" />
              }
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#007a5a" }}>{t(`${p}.downloadPdf`)}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingBottom: 16, gap: 14, alignItems: "flex-start" }}>
            <View style={{ width: 96, height: 116, borderRadius: 9, overflow: "hidden", backgroundColor: "#d4e9e1", borderWidth: 1.5, borderColor: "#9fd4bc", flexShrink: 0 }}>
              {photoUrl
                ? <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Ionicons name="person" size={44} color="#7ab8a1" /></View>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "900", color: "#0a1a12", lineHeight: 22, marginBottom: 1 }}>{name || "—"}</Text>
              {!!nameEn && <Text style={{ fontSize: 11, color: "#6b8f80", marginBottom: 9, fontStyle: "italic" }}>{nameEn}</Text>}
              <View style={{ height: 1, backgroundColor: "#eef4f0", marginBottom: 9 }} />
              <InfoRow icon="briefcase-outline" label={t(`${p}.position`)} value={position} />
              <InfoRow icon="business-outline" label={t(`${p}.affiliation`)} value={affil} />
              <InfoRow icon="mail-outline" label={t(`${p}.email`)} value={email} isEmail />
              <InfoRow icon="call-outline" label={t(`${p}.phone`)} value={phone} />
            </View>
          </View>
        </View>

        <FlatSection icon="settings-sharp" iconBg="#007a5a" title={t(`${p}.secExpertise`)}>
          {expertises.length > 0
            ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {expertises.map((e, i) => <Tag key={i} label={e.name ?? e.label ?? String(e)} />)}
              </View>
            : <Empty />}
        </FlatSection>

        <FlatSection icon="star" iconBg="#f59e0b" title={t(`${p}.secInterest`)}>
          {interests.length > 0
            ? <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {interests.map((e, i) => <Tag key={i} label={e.name ?? e.label ?? String(e)} bg="#fff8e7" border="#f5c842" color="#7a5500" />)}
              </View>
            : <Empty />}
        </FlatSection>

        <Section icon="school" iconBg="#1565c0" title={t(`${p}.secEducation`)} count={educations.length} defaultOpen={educations.length > 0}>
          {educations.length > 0 ? <DataTable cols={cEdu} rows={rEdu} /> : <Empty />}
        </Section>

        <Section icon="briefcase" iconBg="#4527a0" title={t(`${p}.secWork`)} count={workexes.length} defaultOpen={workexes.length > 0}>
          {workexes.length > 0 ? <DataTable cols={cWork} rows={rWork} /> : <Empty />}
        </Section>

        <Section icon="people" iconBg="#00695c" title={t(`${p}.secAdmin`)} count={boardexes.length} defaultOpen={boardexes.length > 0}>
          {boardexes.length > 0 ? <DataTable cols={cAdmin} rows={rAdmin} /> : <Empty />}
        </Section>

        <Section icon="flask" iconBg="#2e7d32" title={t(`${p}.secResearch`)} count={researches.length} defaultOpen={researches.length > 0}>
          {researches.length > 0 ? <DataTable cols={cResearch} rows={rResearch} /> : <Empty />}
        </Section>

        <Section icon="newspaper" iconBg="#00838f" title={t(`${p}.secJournal`)} count={journals.length} defaultOpen={false}>
          {journals.length > 0 ? <DataTable cols={cJournal} rows={rJournal} /> : <Empty />}
        </Section>

        <Section icon="document-text" iconBg="#6a1b9a" title={t(`${p}.secProceeding`)} count={proceedings.length} defaultOpen={false}>
          {proceedings.length > 0 ? <DataTable cols={cProceeding} rows={rProceeding} /> : <Empty />}
        </Section>

        <Section icon="shield-checkmark" iconBg="#c62828" title={t(`${p}.secHumanSubjects`)} count={hsps.length} defaultOpen={false}>
          {hsps.length > 0 ? <DataTable cols={cHsp} rows={rHsp} /> : <Empty />}
        </Section>

        <Section icon="library" iconBg="#1b5e20" title={t(`${p}.secBooks`)} count={books.length} defaultOpen={false}>
          {books.length > 0 ? <DataTable cols={cBook} rows={rBook} /> : <Empty />}
        </Section>

        <Section icon="ribbon" iconBg="#e65100" title={t(`${p}.secPatents`)} count={patents.length} defaultOpen={false}>
          {patents.length > 0 ? <DataTable cols={cPatent} rows={rPatent} /> : <Empty />}
        </Section>

        <Section icon="trophy" iconBg="#f57f17" title={t(`${p}.secAwards`)} count={awards.length} defaultOpen={false}>
          {awards.length > 0 ? <DataTable cols={cAward} rows={rAward} /> : <Empty />}
        </Section>

        <Section icon="mic" iconBg="#ad1457" title={t(`${p}.secSpeakers`)} count={lecturers.length} defaultOpen={false}>
          {lecturers.length > 0 ? <DataTable cols={cLecturer} rows={rLecturer} /> : <Empty />}
        </Section>

        <Section icon="clipboard" iconBg="#0277bd" title={t(`${p}.secTrainings`)} count={trainings.length} defaultOpen={false}>
          {trainings.length > 0 ? <DataTable cols={cTraining} rows={rTraining} /> : <Empty />}
        </Section>

        <Section icon="people-circle" iconBg="#558b2f" title={t(`${p}.secServices`)} count={academics.length} defaultOpen={false}>
          {academics.length > 0 ? <DataTable cols={cAcademic} rows={rAcademic} /> : <Empty />}
        </Section>

      </ScrollView>
    </View>
  );
}
