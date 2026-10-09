import React from "react";
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import useLrdSession from "../../hook/useLrdSession";
import { LRD_API_BASE_URL } from "../../config";
import { useEResearchText } from "./i18n";
import { getResearchTitleEn, getResearchTitleTh, getResearchYear } from "./researchFields";
import { RESEARCH_FIELD_OPTIONS } from "./mockOptions";

// The endpoint returns the research field as an ISCED id, so the screen
// resolves it against the same list the form offers. An id with no match
// still shows, rather than leaving the row blank.
// A name list may arrive as a string or as an array of names or of row
// objects, depending on how the endpoint serialises the relation. A bare
// array would render as "[object Object]" or vanish, so it is flattened to
// the same comma-separated form the web report uses.
const nameList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (entry && typeof entry === "object"
        ? entry.name ?? entry.fullname ?? entry.researcher_name ?? entry.title ?? ""
        : entry))
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return String(value ?? "").trim();
};

const researchFieldLabel = (item) => {
  // The endpoint resolves the ISCED category for us now; the local list is
  // only a fallback for a row that predates that.
  const named = String(item?.isced_name ?? "").trim();
  if (named) return named;
  const id = item?.isced_id ?? item?.work_id ?? item?.field_name;
  if (id === null || id === undefined || id === "") return "";
  const match = RESEARCH_FIELD_OPTIONS.find((option) => String(option.id) === String(id));
  // Stored ISCED codes are broad-field numbers such as 4000, which the form's
  // short list does not cover. Showing the bare number tells the reader
  // nothing, so an unresolved code is left out and the row drops away.
  return match ? match.label : "";
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const valueOrDash = (value) => value === null || value === undefined || value === "" ? "-" : String(value);

const makePdfFilename = (value, fallback) => {
  const safeName = String(value || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "")
    .slice(0, 90);
  return `${safeName || fallback}.pdf`;
};

// BCG and SDG belong to the area-based projects endpoint, not to research
// records, so they are not listed here.
const projectRows = (item, te) => [
  [te("date.yearShort"), getResearchYear(item)],
  [te("project.titleTh"), getResearchTitleTh(item)],
  [te("project.titleEn"), getResearchTitleEn(item)],
  [te("project.field"), researchFieldLabel(item)],
  [te("project.funding"), item.fund_name || item.funding_source || item.fund_id],
  // The record's owner. The web research report names them above the
  // contributors, and the endpoint returns researcher_name for every row.
  [te("project.owner"), nameList(item.researcher_name ?? item.researcherName)],
  [te("project.keywords"), item.keyword],
  [te("project.objective"), item.objective],
  [te("project.abstract"), item.abstract],
  // The endpoint carries the contributor list as `contributor` and, since the
  // backend joined the relation, also as `members`. Either may be the filled
  // one depending on how the record was created, so whichever has names wins.
  [te("project.contributors"), nameList(item.contributor ?? item.contributors) || nameList(item.members)],
  [te("project.localExperts"), nameList(item.local_expert ?? item.expert ?? item.localExperts)],
  [te("project.fundType"), item.fundtype_name],
  [te("project.tagGroup"), item.taggroup_name],
  [te("project.proposal"), item.propose],
  [te("project.budget"), item.budget],
];

const paperRows = (item, te) => [
  [te("article.publishYear"), item.publicyear],
  [te("article.documentType"), item.paperindex_name || item.paperindexname || item.paperindex_id],
  [te("article.funding"), item.fund_name || item.fund_id],
  [te("article.titleTh"), item.title_th],
  [te("article.titleEn"), item.title_eng],
  [te("article.journal"), item.source],
  [te("article.keywords"), item.keyword],
  [te("article.contributors"), nameList(item.contributor)],
  [te("article.abstract"), item.abstract],
  [te("article.url"), item.url],
  [te("article.reference"), item.reference],
];

const resolveDocumentUrl = (item) => {
  const raw = item.pdf_url || item.pdfUrl || item.document_url || item.url || item.file;
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${LRD_API_BASE_URL.replace(/\/$/, "")}/${String(raw).replace(/^\//, "")}`;
};

export default function ResearchDocumentDetail({ navigation, route }) {
  const { te } = useEResearchText();
  const type = route.params?.type === "paper" ? "paper" : "project";
  const item = route.params?.item ?? {};
  const { researcherId } = useLrdSession();
  const isOwner = researcherId && String(item.researcher_id) === String(researcherId);
  const isPaper = type === "paper";
  const title = isPaper ? item.title_th : getResearchTitleTh(item);
  // The budget is the one field the search view withholds: a researcher may
  // read someone else's record, but not what it was funded for.
  const searchMode = route.params?.searchMode === true;
  const hiddenLabels = searchMode && !isPaper ? [te("project.budget")] : [];
  const rows = (isPaper ? paperRows(item, te) : projectRows(item, te))
    .filter(([label, value]) => value !== null && value !== undefined && value !== ""
      && !hiddenLabels.includes(label));
  // Research records carry a pdf_url too, so the attachment is reachable for
  // both kinds rather than papers alone.
  const documentUrl = resolveDocumentUrl(item);

  const buildHtml = () => `<!doctype html>
    <html lang="th"><head><meta charset="utf-8"><style>
      @page { margin: 22mm 18mm; }
      body { font-family: sans-serif; color: #17352a; font-size: 14px; line-height: 1.65; }
      h1 { color: #174D42; font-size: 23px; margin: 0 0 6px; }
      .type { color: #5F7069; margin-bottom: 22px; }
      .row { border-bottom: 1px solid #dfe9e4; padding: 9px 0; }
      .label { color: #587266; font-weight: bold; margin-bottom: 2px; }
      .value { white-space: pre-wrap; overflow-wrap: anywhere; }
      .footer { color: #5F7069; font-size: 11px; margin-top: 24px; }
    </style></head><body>
      <h1>${escapeHtml(title || (isPaper ? te("detail.articleTitle") : te("detail.projectTitle")))}</h1>
      <div class="type">${isPaper ? te("detail.articleTitle") : te("detail.projectTitle")}</div>
      ${rows.map(([label, value]) => `<div class="row"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(valueOrDash(value))}</div></div>`).join("")}
      <div class="footer">URU Smart e-Research</div>
    </body></html>`;

  const exportPdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      const filename = makePdfFilename(title, isPaper ? te("detail.articleTitle") : te("detail.projectTitle"));
      const namedUri = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}${filename}` : uri;
      if (namedUri !== uri) {
        await FileSystem.deleteAsync(namedUri, { idempotent: true });
        await FileSystem.copyAsync({ from: uri, to: namedUri });
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(namedUri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: filename,
        });
      } else {
        await Print.printAsync({ html: buildHtml() });
      }
    } catch (error) {
      Alert.alert(te("detail.exportFailed"), error.message || te("common.tryAgain"));
    }
  };

  const openOriginal = async () => {
    try {
      const supported = await Linking.canOpenURL(documentUrl);
      if (!supported) throw new Error(te("detail.unsupportedLink"));
      await Linking.openURL(documentUrl);
    } catch (error) {
      Alert.alert(te("detail.openFailed"), error.message || te("common.tryAgain"));
    }
  };

  return (
    <View className="flex-1 bg-[#edf5f1]">
      <AppHeader title={isPaper ? te("detail.articleTitle") : te("detail.projectTitle")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-[20px] p-5 mb-4" style={{ elevation: 2 }}>
          <View className="flex-row items-start">
            <View className="w-11 h-11 rounded-xl bg-[#e3f3eb] items-center justify-center mr-3">
              <Ionicons name={isPaper ? "newspaper-outline" : "folder-open-outline"} size={21} color="#07865F" />
            </View>
            <View className="flex-1">
              <Text className="text-[18px] font-black text-[#17352a] leading-6" selectable>{title || "-"}</Text>
              <View className={`self-start rounded-full px-3 py-1 mt-2 ${isOwner ? "bg-[#e3f3eb]" : "bg-[#eef1f0]"}`}>
                <Text className={`text-[12px] font-bold ${isOwner ? "text-[#07865F]" : "text-[#5d6b65]"}`}>
                  {isOwner ? te("detail.myDocument") : te("detail.readOnly")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-white rounded-[20px] px-5 py-2 mb-4" style={{ elevation: 1 }}>
          {rows.map(([label, value]) => (
            <View key={label} className="py-3 border-b border-[#edf1ef]">
              <Text className="text-[13px] font-bold text-[#6b8177] mb-1">{label}</Text>
              <Text className="text-[15px] text-[#213c31] leading-6" selectable>{valueOrDash(value)}</Text>
            </View>
          ))}
        </View>

        {documentUrl && (
          <TouchableOpacity className="min-h-[48px] bg-white border border-[#07865F] rounded-xl px-4 mb-3 flex-row items-center justify-center" onPress={openOriginal} activeOpacity={0.75} accessibilityRole="button">
            <Ionicons name="open-outline" size={19} color="#07865F" />
            <Text className="text-[#07865F] text-[15px] font-extrabold ml-2">{te("detail.openOriginal")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity className="min-h-[48px] bg-[#07865F] rounded-xl px-4 flex-row items-center justify-center" onPress={exportPdf} activeOpacity={0.78} accessibilityRole="button">
          <Ionicons name="download-outline" size={19} color="#fff" />
          <Text className="text-white text-[15px] font-extrabold ml-2">{te("detail.exportPdf")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
