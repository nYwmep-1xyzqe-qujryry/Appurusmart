import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import FormContainer from "../../components/expert/FormContainer";
import FormField from "../../components/expert/FormField";
import InlineDropdown from "../../components/expert/InlineDropdown";
import KeyboardAwareScrollView from "../../components/expert/KeyboardAwareScrollView";
import useLrdResource from "../../hook/useLrdResource";
import { LRD_ENDPOINTS } from "../../services/lrdApi";
import useLrdSession from "../../hook/useLrdSession";
import { FUNDING_SOURCE_OPTIONS, RESEARCH_FIELD_OPTIONS } from "./mockOptions";
import { useEResearchText, withPlaceholder } from "./i18n";

const emptyForm = {
  year: "",
  field: "",
  fundingSource: "",
  titleTh: "",
  titleEn: "",
  keywords: "",
  objective: "",
  abstract: "",
  contributors: "",
  localExperts: "",
  budget: "",
};

export default function ProjectForm({ navigation, route }) {
  const { te } = useEResearchText();
  const editingItem = route.params?.item ?? null;
  const { researcherId, loading: sessionLoading, connecting, connect } = useLrdSession();
  const canEdit = !editingItem || !researcherId || (
    String(editingItem.researcher_id) === String(researcherId)
  );
  const { create, update, saving } = useLrdResource(LRD_ENDPOINTS.projects, {
    loadOnFocus: false,
    refetchAfterMutation: false,
  });
  const [form, setForm] = useState(
    editingItem
      ? {
          ...emptyForm,
          ...editingItem,
          year: String(editingItem.year_id ?? editingItem.year ?? ""),
          field: String(editingItem.work_id ?? editingItem.field ?? ""),
          fundingSource: String(editingItem.fund_id ?? editingItem.funding_source_id ?? ""),
          titleTh: editingItem.projectname ?? editingItem.titleTh ?? "",
          titleEn: editingItem.projectname_eng ?? editingItem.title_eng ?? editingItem.titleEn ?? "",
          keywords: editingItem.keyword ?? editingItem.keywords ?? "",
          objective: editingItem.objective ?? "",
          abstract: editingItem.abstract ?? "",
          contributors: editingItem.contributor ?? editingItem.contributors ?? "",
          localExperts: editingItem.local_expert ?? editingItem.localExperts ?? "",
          budget: String(editingItem.budget ?? ""),
        }
      : emptyForm,
  );
  const researchFieldOptions = withPlaceholder(RESEARCH_FIELD_OPTIONS, te("project.fieldPlaceholder"));
  const fundingSourceOptions = withPlaceholder(FUNDING_SOURCE_OPTIONS, te("project.fundingPlaceholder"));

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (sessionLoading) return;
    if (!form.year || !form.field || !form.fundingSource || !form.titleTh.trim() || !form.keywords.trim()) {
      Alert.alert(te("common.requiredTitle"), te("project.requiredMessage"));
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
        Alert.alert(te("common.noPermissionTitle"), te("project.noPermissionMessage"));
        return;
      }
      const payload = {
        projectname: form.titleTh.trim(),
        year_id: Number(form.year),
        work_id: Number(form.field),
        fund_id: Number(form.fundingSource),
        projectname_eng: form.titleEn.trim() || null,
        keyword: form.keywords.trim(),
        objective: form.objective.trim() || null,
        abstract: form.abstract.trim() || null,
        contributor: form.contributors.trim() || null,
        local_expert: form.localExperts.trim() || null,
        budget: form.budget === "" ? null : Number(form.budget),
      };
      editingItem ? await update(editingItem.id, payload) : await create(payload);
      Alert.alert(editingItem ? te("common.editSuccess") : te("common.saveSuccess"), te("project.saveMessage"), [
        { text: te("common.ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(te("common.saveFailed"), err.message ?? te("common.tryAgain"));
    }
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader title={te("project.title")} onBack={() => navigation.goBack()} />
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
              {editingItem ? te("project.editTitle") : te("project.addTitle")}
            </Text>
          </View>

          <FormField
            label={te("project.year")}
            value={form.year}
            onChangeText={(value) => set("year", value.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="numeric"
            placeholder={te("project.yearPlaceholder")}
            required
          />
          <InlineDropdown label={te("project.field")} value={form.field} options={researchFieldOptions} onSelect={(v) => set("field", v)} required searchable />
          <InlineDropdown label={te("project.funding")} value={form.fundingSource} options={fundingSourceOptions} onSelect={(v) => set("fundingSource", v)} required searchable compact />
          <FormField label={te("project.titleTh")} value={form.titleTh} onChangeText={(v) => set("titleTh", v)} required />
          <FormField label={te("project.titleEn")} value={form.titleEn} onChangeText={(v) => set("titleEn", v)} />
          <FormField label={te("project.keywords")} value={form.keywords} onChangeText={(v) => set("keywords", v)} placeholder={te("project.keywordsPlaceholder")} required />
          <FormField label={te("project.objective")} value={form.objective} onChangeText={(v) => set("objective", v)} multiline />
          <FormField label={te("project.abstract")} value={form.abstract} onChangeText={(v) => set("abstract", v)} multiline />
          <FormField label={te("project.contributors")} value={form.contributors} onChangeText={(v) => set("contributors", v)} />
          <FormField label={te("project.localExperts")} value={form.localExperts} onChangeText={(v) => set("localExperts", v)} />
          <FormField label={te("project.budget")} value={form.budget} onChangeText={(v) => set("budget", v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder={te("project.budgetPlaceholder")} />

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
