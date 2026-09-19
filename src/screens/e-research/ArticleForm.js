import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import FormContainer from "../../components/expert/FormContainer";
import FormField from "../../components/expert/FormField";
import InlineDropdown from "../../components/expert/InlineDropdown";
import KeyboardAwareScrollView from "../../components/expert/KeyboardAwareScrollView";
import useLrdResource from "../../hook/useLrdResource";
import useLrdSession from "../../hook/useLrdSession";
import { LRD_ENDPOINTS } from "../../services/lrdApi";
import { normalizeOptionalUrl } from "../../utils/url";
import { DOCUMENT_TYPE_OPTIONS, FUNDING_SOURCE_OPTIONS } from "./mockOptions";
import { useEResearchText, withPlaceholder } from "./i18n";

const emptyForm = {
  documentType: "",
  fundingSource: "",
  titleTh: "",
  titleEn: "",
  abstract: "",
  keywords: "",
  contributors: "",
  journal: "",
  publishYear: "",
  url: "",
  reference: "",
};

export default function ArticleForm({ navigation, route }) {
  const { te } = useEResearchText();
  const editingItem = route.params?.item ?? null;
  const { researcherId, loading: sessionLoading, connecting, connect } = useLrdSession();
  const canEdit = !editingItem || !researcherId || String(editingItem.researcher_id) === String(researcherId);
  const { create, update, saving } = useLrdResource(LRD_ENDPOINTS.papers, {
    loadOnFocus: false,
    refetchAfterMutation: false,
  });
  const { items: paperIndexes, loading: paperIndexesLoading } = useLrdResource(LRD_ENDPOINTS.paperIndexes);
  const fundingSourceOptions = withPlaceholder(FUNDING_SOURCE_OPTIONS, te("article.fundingPlaceholder"));
  const paperIndexOptions = paperIndexes.length > 0
      ? [{ id: "", label: te("article.documentTypePlaceholder") }, ...paperIndexes.map((item) => ({
        id: String(item.id ?? item.paperindex_id ?? ""),
        label: item.name_th ?? item.paperindexname ?? item.name ?? item.title ?? te("article.typeFallback", { id: item.id ?? item.paperindex_id }),
      }))]
    : withPlaceholder(DOCUMENT_TYPE_OPTIONS, te("article.documentTypePlaceholder"));
  const [form, setForm] = useState(editingItem ? {
    ...emptyForm,
    documentType: String(editingItem.paperindex_id ?? ""),
    fundingSource: String(editingItem.fund_id ?? editingItem.funding_source_id ?? ""),
    titleTh: editingItem.title_th ?? "",
    titleEn: editingItem.title_eng ?? "",
    abstract: editingItem.abstract ?? "",
    keywords: editingItem.keyword ?? "",
    contributors: editingItem.contributor ?? editingItem.contributors ?? "",
    journal: editingItem.source ?? "",
    publishYear: String(editingItem.publicyear ?? ""),
    url: editingItem.url ?? "",
    reference: editingItem.reference ?? "",
  } : emptyForm);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));


  const handleSave = async () => {
    if (!form.documentType || !form.titleTh.trim()) {
      Alert.alert(te("common.requiredTitle"), te("article.requiredMessage"));
      return;
    }
    const normalizedUrl = normalizeOptionalUrl(form.url);
    if (!normalizedUrl.ok) {
      Alert.alert(
        te("article.invalidUrlTitle"),
        te("article.invalidUrlMessage"),
      );
      return;
    }
    try {
      let activeResearcherId = researcherId;
      if (!activeResearcherId) {
        const registration = await connect();
        activeResearcherId = registration?.researcher_id;
      }
      if (!activeResearcherId) throw new Error(te("common.researcherMissing"));
      if (editingItem && String(editingItem.researcher_id) !== String(activeResearcherId)) {
        Alert.alert(te("common.noPermissionTitle"), te("article.noPermissionMessage"));
        return;
      }
      const values = {
        paperindex_id: form.documentType,
        title_th: form.titleTh.trim(),
        public: 1,
        status: 1,
        ...(form.fundingSource ? { fund_id: form.fundingSource } : {}),
        ...(form.titleEn.trim() ? { title_eng: form.titleEn.trim() } : {}),
        ...(form.abstract.trim() ? { abstract: form.abstract.trim() } : {}),
        ...(form.keywords.trim() ? { keyword: form.keywords.trim() } : {}),
        ...(form.contributors.trim() ? { contributor: form.contributors.trim() } : {}),
        ...(form.journal.trim() ? { source: form.journal.trim() } : {}),
        ...(form.publishYear ? { publicyear: Number(form.publishYear) } : {}),
        ...(normalizedUrl.url ? { url: normalizedUrl.url } : {}),
        ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
      };
      const payload = values;
      editingItem ? await update(editingItem.id, payload) : await create(payload);
      Alert.alert(editingItem ? te("common.editSuccess") : te("common.saveSuccess"), te("article.saveMessage"), [
        { text: te("common.ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(te("common.saveFailed"), err.message ?? te("common.tryAgain"));
    }
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader title={te("article.title")} onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 18, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name={editingItem ? "create" : "add-circle"} size={16} color="#174D42" />
            <Text className="text-[14px] font-extrabold text-[#174D42]">
              {editingItem ? te("article.editTitle") : te("article.addTitle")}
            </Text>
          </View>

          <InlineDropdown label={te("article.documentType")} value={form.documentType} options={paperIndexOptions} onSelect={(v) => set("documentType", v)} required loading={paperIndexesLoading && paperIndexes.length === 0} />
          <InlineDropdown label={te("article.funding")} value={form.fundingSource} options={fundingSourceOptions} onSelect={(v) => set("fundingSource", v)} searchable compact />
          <FormField label={te("article.titleTh")} value={form.titleTh} onChangeText={(v) => set("titleTh", v)} required />
          <FormField label={te("article.titleEn")} value={form.titleEn} onChangeText={(v) => set("titleEn", v)} />
          <FormField label={te("article.abstract")} value={form.abstract} onChangeText={(v) => set("abstract", v)} multiline />
          <FormField label={te("article.keywords")} value={form.keywords} onChangeText={(v) => set("keywords", v)} placeholder={te("article.keywordsPlaceholder")} />
          <FormField label={te("article.contributors")} value={form.contributors} onChangeText={(v) => set("contributors", v)} />
          <FormField label={te("article.journal")} value={form.journal} onChangeText={(v) => set("journal", v)} />
          <FormField
            label={te("article.publishYear")}
            value={form.publishYear}
            onChangeText={(value) => set("publishYear", value.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="numeric"
            placeholder={te("article.publishYearPlaceholder")}
          />
          <FormField
            label={te("article.url")}
            value={form.url}
            onChangeText={(v) => set("url", v)}
            placeholder={te("article.urlPlaceholder")}
            keyboardType="url"
          />
          <FormField label={te("article.reference")} value={form.reference} onChangeText={(v) => set("reference", v)} />

          <View className="flex-row gap-[10px] px-4 pt-2 pb-[18px]">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]"
              style={{ elevation: 2, opacity: saving || connecting || sessionLoading || !canEdit ? 0.6 : 1 }}
              onPress={handleSave}
              disabled={saving || connecting || sessionLoading || !canEdit}
              activeOpacity={0.85}
            >
              {saving || connecting ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text className="text-white text-[15px] font-black">{te("common.saveData")}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center gap-[6px] bg-[#f4f6f8] rounded-xl px-[18px]"
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text className="text-[#5F7069] text-[15px] font-black">{te("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </FormContainer>
  );
}
