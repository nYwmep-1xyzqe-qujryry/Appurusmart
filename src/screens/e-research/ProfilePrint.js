import React, { useEffect, useState } from "react";
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import useLrdResource from "../../hook/useLrdResource";
import useLocalObject from "../../hook/useLocalObject";
import useCurrentUser from "../../hook/useCurrentUser";
import { STORAGE_KEYS } from "../../config";
import { getLrd, LRD_ENDPOINTS } from "../../services/lrdApi";
import { formatThaiDate } from "../../utils/thaiDate";
import {
  DEGREE_OPTIONS,
  DEPARTMENT_OPTIONS,
  EXPERTISE_GROUP_OPTIONS,
  FACULTY_OPTIONS,
  getLabel,
} from "./mockOptions";
import { useEResearchText } from "./i18n";

const InfoRow = ({ icon, label, value }) => (
  <View className="flex-row items-start gap-2 py-[6px]">
    <Ionicons name={icon} size={14} color="#8fa89f" style={{ marginTop: 2 }} />
    <Text className="text-[11px] text-[#8fa89f] font-semibold" style={{ width: 92 }}>{label}</Text>
    <Text className="flex-1 text-[13px] text-[#1f2a2e]" numberOfLines={2}>{value || "-"}</Text>
  </View>
);

const CardHeader = ({ icon, title }) => (
  <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
    <Ionicons name={icon} size={16} color="#00614a" />
    <Text className="text-[13px] font-extrabold text-[#00614a]">{title}</Text>
  </View>
);

const ToggleRow = ({ label, checked, onToggle }) => (
  <TouchableOpacity className="flex-row items-center gap-[10px] py-[10px]" activeOpacity={0.7} onPress={onToggle}>
    <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? "#007a5a" : "#c4d4cc"} />
    <Text className="text-[13px] text-[#1f2a2e] flex-1">{label}</Text>
  </TouchableOpacity>
);

const makeProfileFilename = (name, title, fallback) => {
  const safeName = String(name || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 80);
  return `${title}_${safeName || fallback}.pdf`;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const getImageMimeType = (uri) => {
  const cleanUri = String(uri || "").split("?")[0].toLowerCase();
  if (cleanUri.endsWith(".png")) return "image/png";
  if (cleanUri.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const getPrintableImage = async (uri) => {
  if (!uri || uri.startsWith("data:")) return uri || "";
  try {
    let localUri = uri;
    if (/^https?:\/\//i.test(uri)) {
      const extension = getImageMimeType(uri) === "image/png" ? "png" : "jpg";
      const targetUri = `${FileSystem.cacheDirectory}researcher-profile.${extension}`;
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
      const result = await FileSystem.downloadAsync(uri, targetUri);
      localUri = result.uri;
    }
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:${getImageMimeType(uri)};base64,${base64}`;
  } catch (_) {
    return uri;
  }
};

export default function ProfilePrint({ navigation }) {
  const { te } = useEResearchText();
  const { user } = useCurrentUser(navigation);
  const [profile, setProfile] = useState({});
  const { items: education } = useLrdResource(LRD_ENDPOINTS.educations);
  const { items: expertise } = useLrdResource(LRD_ENDPOINTS.expertises);
  const { items: projects } = useLrdResource(LRD_ENDPOINTS.projects);
  const { items: articles } = useLrdResource(LRD_ENDPOINTS.papers);

  useEffect(() => {
    getLrd(LRD_ENDPOINTS.researcherMe).then((res) => {
      const raw = res.data?.data ?? res.data ?? {};
      setProfile({
        prefix: raw.prefix ?? "",
        firstName: raw.firstName ?? raw.first_name ?? "",
        lastName: raw.lastName ?? raw.last_name ?? "",
        faculty: String(raw.faculty?.id ?? raw.faculty_id ?? raw.faculty ?? ""),
        department: String(raw.department?.id ?? raw.branch_id ?? raw.department ?? ""),
        position: raw.position ?? "",
        address: raw.address ?? "",
        birthdate: raw.birthdate ?? "",
        phone: raw.phone ?? raw.tel ?? "",
        email: raw.email ?? "",
        lineId: raw.lineId ?? raw.line_id ?? "",
        photo: raw.picture ?? raw.photo ?? raw.avatar ?? "",
      });
    }).catch(() => {});
  }, []);
  const { value: publishSettings, save: savePublish } = useLocalObject(STORAGE_KEYS.E_RESEARCH_PUBLISH_SETTINGS, {
    visible: true,
    headDefined: false,
  });

  const fullName = `${profile.prefix ?? ""}${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
  const profileImage = user.photoUrl;
  const faculty = getLabel(FACULTY_OPTIONS, profile.faculty);
  const department = getLabel(DEPARTMENT_OPTIONS, profile.department);

  const buildHtml = (printableImage = profileImage) => {
    const affiliation = [department, faculty, te("print.university")].filter(Boolean).join(" ");
    const educationRows = education.map((item) => [
      item.year || "-",
      getLabel(DEGREE_OPTIONS, item.degree),
      item.qualification,
      item.major ?? item.course,
      item.university,
    ].filter(Boolean).join(" · "));
    const expertiseRows = expertise.map((item) => [item.nameTh, item.nameEn].filter(Boolean).join(" / "));
    const projectRows = projects.map((item) => `${item.year_id || "-"} — ${item.projectname || "-"}`);
    const collaboratorRows = projects
      .filter((item) => item.role === "contributor" || item.is_contributor || item.project_role === "co-researcher")
      .map((item) => `${item.year_id || "-"} — ${item.projectname || "-"}`);
    const articleRows = articles.map((item) => `${item.publicyear || "-"} — ${item.title_th || item.title_eng || "-"}`);
    const renderList = (rows) => rows.length
      ? `<ul>${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`
      : `<div class="empty">-</div>`;
    return `<!doctype html>
      <html lang="th">
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 18mm 20mm 20mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #171717; font-family: sans-serif; font-size: 12px; line-height: 1.55; }
            h1 { margin: 0 0 18px; color: #8a3f16; font-size: 20px; font-weight: 500; text-align: center; }
            .identity { display: flex; align-items: flex-start; gap: 24px; }
            .details { flex: 1; }
            .row { display: grid; grid-template-columns: 128px 1fr; gap: 12px; margin-bottom: 6px; }
            .label { font-weight: 700; }
            .value { white-space: pre-wrap; overflow-wrap: anywhere; }
            .photo { width: 82px; height: 104px; border: 1px solid #b8b8b8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
            .photo img { width: 100%; height: 100%; object-fit: cover; }
            .no-photo { color: #686868; font-size: 9px; line-height: 1.2; text-align: center; }
            .section { margin-top: 20px; break-inside: avoid; }
            .section-title { margin: 0 0 8px; font-size: 13px; font-weight: 700; }
            ul { margin: 0; padding-left: 18px; }
            li { margin-bottom: 4px; break-inside: avoid; }
            .empty { color: #777; padding-left: 2px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(te("print.htmlTitle"))}</h1>
          <div class="identity">
            <div class="details">
              <div class="row"><div class="label">${escapeHtml(te("print.htmlFullName"))}</div><div class="value">${escapeHtml(fullName || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlPosition"))}</div><div class="value">${escapeHtml(profile.position || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlAffiliation"))}</div><div class="value">${escapeHtml(affiliation || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlAddress"))}</div><div class="value">${escapeHtml(profile.address || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlEmail"))}</div><div class="value">${escapeHtml(profile.email || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlPhone"))}</div><div class="value">${escapeHtml(profile.phone || "-")}</div></div>
              <div class="row"><div class="label">${escapeHtml(te("print.htmlExpertise"))}</div><div class="value">${escapeHtml(expertiseRows.join(", ") || "-")}</div></div>
            </div>
            <div class="photo">
              ${printableImage ? `<img src="${escapeHtml(printableImage)}" alt="" />` : `<div class="no-photo">NO IMAGE<br />AVAILABLE</div>`}
            </div>
          </div>

          <section class="section"><h2 class="section-title">${escapeHtml(te("print.educationTitle"))}</h2>${renderList(educationRows)}</section>
          <section class="section"><h2 class="section-title">${escapeHtml(te("print.projectTitle"))}</h2>${renderList(projectRows)}</section>
          <section class="section"><h2 class="section-title">${escapeHtml(te("print.collaboratorTitle"))}</h2>${renderList(collaboratorRows)}</section>
          <section class="section"><h2 class="section-title">${escapeHtml(te("print.articleTitle"))}</h2>${renderList(articleRows)}</section>
        </body>
      </html>`;
  };

  const handlePrint = async () => {
    try {
      const printableImage = await getPrintableImage(profileImage);
      const html = buildHtml(printableImage);
      const { uri } = await Print.printToFileAsync({ html });
      const filename = makeProfileFilename(fullName, te("print.title"), te("print.researcherFallback"));
      const namedUri = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}${filename}` : uri;
      if (namedUri !== uri) {
        await FileSystem.deleteAsync(namedUri, { idempotent: true });
        await FileSystem.copyAsync({ from: uri, to: namedUri });
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(namedUri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: filename,
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (err) {
      Alert.alert(te("print.printFailed"), err.message ?? te("common.tryAgain"));
    }
  };

  return (
    <View className="flex-1 bg-[#f0f4f2]">
      <AppHeader title={te("print.title")} onBack={() => navigation.goBack()} rightIcon="print-outline" onRightPress={handlePrint} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden" style={{ elevation: 1 }}>
          <View className="items-center py-6 px-4">
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#e6f4ef", borderWidth: 2, borderColor: "#007a5a", overflow: "hidden", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={{ width: 96, height: 96 }} resizeMode="cover" />
              ) : (
                <Ionicons name="person" size={44} color="#7ab8a1" />
              )}
            </View>
            <Text className="text-[17px] font-black text-[#0a1a12] text-center">{fullName || "-"}</Text>
            {!!faculty && <Text className="text-[12px] text-[#5a7a6e] mt-1 text-center">{department ? `${department} · ${faculty}` : faculty}</Text>}
            <Text className="text-[11px] text-[#8fa89f] mt-[2px]">{te("print.university")}</Text>
          </View>
          <View className="h-px bg-[#eef1f4]" />
          <View className="px-[14px] py-[10px]">
            <InfoRow icon="calendar-outline" label={te("print.birthdate")} value={formatThaiDate(profile.birthdate)} />
            <InfoRow icon="mail-outline" label={te("print.email")} value={profile.email} />
            <InfoRow icon="call-outline" label={te("print.phone")} value={profile.phone} />
            <InfoRow icon="chatbubble-outline" label={te("print.lineId")} value={profile.lineId} />
            <InfoRow icon="card-outline" label={te("print.idCard")} value={profile.idCard} />
            <InfoRow icon="home-outline" label={te("print.address")} value={profile.address} />
          </View>
        </View>

        {/* วุฒิการศึกษา */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden" style={{ elevation: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate("ResearcherForm")} activeOpacity={0.7}>
            <CardHeader icon="school-outline" title={`${te("print.educationTitle")} (${education.length})`} />
          </TouchableOpacity>
          <View className="px-[14px] py-[10px]">
            {education.length === 0 ? (
              <Text className="text-[12px] text-[#9aa6b1]">{te("print.noData")}</Text>
            ) : (
              education.map((e) => (
                <Text key={e.id} className="text-[12px] text-[#3f4d50] py-[3px]" numberOfLines={1}>
                  • {e.year} — {getLabel(DEGREE_OPTIONS, e.degree)} {[e.qualification, e.major ?? e.course].filter(Boolean).join(" · ")} ({e.university})
                </Text>
              ))
            )}
          </View>
        </View>

        {/* ความเชี่ยวชาญ */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden" style={{ elevation: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate("ResearcherForm")} activeOpacity={0.7}>
            <CardHeader icon="flask-outline" title={`${te("print.expertiseTitle")} (${expertise.length})`} />
          </TouchableOpacity>
          <View className="px-[14px] py-[10px] flex-row flex-wrap gap-[6px]">
            {expertise.length === 0 ? (
              <Text className="text-[12px] text-[#9aa6b1]">{te("print.noData")}</Text>
            ) : (
              expertise.map((e) => (
                <View key={e.id} className="bg-[#e6f4ef] border border-[#9fd4bc] rounded-full px-[10px] py-[4px]">
                  <Text className="text-[11px] font-bold text-[#007a5a]">{e.nameTh}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* งานวิจัย */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden" style={{ elevation: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate("ProjectList")} activeOpacity={0.7}>
            <CardHeader icon="document-text-outline" title={`${te("print.projectTitle")} (${projects.length})`} />
          </TouchableOpacity>
          <View className="px-[14px] py-[10px]">
            {projects.length === 0 ? (
              <Text className="text-[12px] text-[#9aa6b1]">{te("print.noData")}</Text>
            ) : (
              projects.map((p) => (
                <Text key={p.id} className="text-[12px] text-[#3f4d50] py-[3px]" numberOfLines={1}>
                  • {p.year_id} — {p.projectname}
                </Text>
              ))
            )}
          </View>
        </View>

        {/* บทความวิจัย/วิชาการ */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden" style={{ elevation: 1 }}>
          <TouchableOpacity onPress={() => navigation.navigate("ArticleList")} activeOpacity={0.7}>
            <CardHeader icon="newspaper-outline" title={`${te("print.articleTitle")} (${articles.length})`} />
          </TouchableOpacity>
          <View className="px-[14px] py-[10px]">
            {articles.length === 0 ? (
              <Text className="text-[12px] text-[#9aa6b1]">{te("print.noData")}</Text>
            ) : (
              articles.map((a) => (
                <Text key={a.id} className="text-[12px] text-[#3f4d50] py-[3px]" numberOfLines={1}>
                  • {a.publicyear} — {a.title_th}
                </Text>
              ))
            )}
          </View>
        </View>

        {/* จัดการข้อมูลการเผยแพร่ */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden px-[14px]" style={{ elevation: 1 }}>
          <View className="py-[11px] border-b border-[#eef1f4]">
            <Text className="text-[13px] font-extrabold text-[#00614a]">{te("print.publishSection")}</Text>
          </View>
          <ToggleRow
            label={te("print.publishVisible")}
            checked={!!publishSettings.visible}
            onToggle={() => savePublish((current) => ({ ...current, visible: !current.visible }))}
          />
          <ToggleRow
            label={te("print.publishHidden")}
            checked={!publishSettings.visible}
            onToggle={() => savePublish((current) => ({ ...current, visible: !current.visible }))}
          />
          <View className="h-px bg-[#eef1f4]" />
          <ToggleRow
            label={te("print.publishHeadDefined")}
            checked={!!publishSettings.headDefined}
            onToggle={() => savePublish((current) => ({ ...current, headDefined: !current.headDefined }))}
          />
        </View>
      </ScrollView>
    </View>
  );
}
