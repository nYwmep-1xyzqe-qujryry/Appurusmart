import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, Text, TouchableOpacity, View } from "react-native";
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
  const { create, update, saving } = useLrdResource(LRD_ENDPOINTS.researches, {
    loadOnFocus: false,
    refetchAfterMutation: false,
  });
  const titleThRef = useRef(null);
  const titleEnRef = useRef(null);
  const keywordsRef = useRef(null);
  const objectiveRef = useRef(null);
  const abstractRef = useRef(null);
  const contributorsRef = useRef(null);
  const localExpertsRef = useRef(null);
  const budgetRef = useRef(null);
  const [form, setForm] = useState(
    editingItem
      ? {
          ...emptyForm,
          ...editingItem,
          year: String(getResearchYear(editingItem)),
          field: String(editingItem.isced_id ?? editingItem.work_id ?? editingItem.field ?? ""),
          fundingSource: String(editingItem.fund_id ?? editingItem.funding_source_id ?? ""),
          titleTh: getResearchTitleTh(editingItem),
          titleEn: getResearchTitleEn(editingItem),
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
      // PUT/PATCH merges: a key that is absent keeps its stored value, but an
      // explicit null clears it. The list and detail responses omit some
      // columns the API still accepts on save (budget, bcg, sdg), so those
      // fields load blank even when the record holds data — sending their
      // emptiness back as null erased it on every edit. On update an optional
      // field is therefore sent only when the user actually has a value for
      // it; clearing one stays possible by submitting an empty string, which
      // the backend stores as empty rather than reading as "unchanged".
      const optional = (value) => {
        const text = String(value ?? "").trim();
        if (text) return text;
        return editingItem ? undefined : null;
      };

      const budgetText = String(form.budget ?? "").trim();
      // The researches endpoint accepts the legacy names too, but sending its
      // own keeps the request readable against the table it writes to.
      // createyear is a 4-digit B.E. year carried as a string.
      const payload = {
        title_th: form.titleTh.trim(),
        createyear: String(form.year),
        // The research field is an ISCED category; researches stores it as
        // isced_id, not the work_id the projects table used.
        isced_id: Number(form.field),
        fund_id: Number(form.fundingSource),
        title_eng: optional(form.titleEn),
        keyword: form.keywords.trim(),
        objective: optional(form.objective),
        abstract: optional(form.abstract),
        contributor: optional(form.contributors),
        local_expert: optional(form.localExperts),
        budget: budgetText ? Number(budgetText) : (editingItem ? undefined : null),
      };
      // undefined would survive into the request body as a dropped key only by
      // accident of the serializer; remove it here so the contract is explicit.
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });
      const mutationResult = editingItem
        ? await update(editingItem.id, payload)
        : await create(payload);
      if (mutationResult === null) return;
      Alert.alert(editingItem ? te("common.editSuccess") : te("common.saveSuccess"), te("project.saveMessage"), [
        { text: te("common.ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      // The backend rejects an edit to a record bound to an LRD proposal with
      // 409 and an explanatory message; that message is the useful thing to
      // show, not a generic failure.
      const conflict = err?.response?.status === 409;
      const serverMessage = err?.response?.data?.message;
      Alert.alert(
        conflict ? te("project.lockedTitle") : te("common.saveFailed"),
        serverMessage || err.message || te("common.tryAgain"),
      );
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
        scrollOnFocus
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
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            blurOnSubmit
          />
          <InlineDropdown label={te("project.field")} value={form.field} options={researchFieldOptions} onSelect={(v) => set("field", v)} required searchable />
          <InlineDropdown label={te("project.funding")} value={form.fundingSource} options={fundingSourceOptions} onSelect={(v) => set("fundingSource", v)} required searchable compact />
          <FormField ref={titleThRef} label={te("project.titleTh")} value={form.titleTh} onChangeText={(v) => set("titleTh", v)} required onSubmitEditing={() => titleEnRef.current?.focus()} />
          <FormField ref={titleEnRef} label={te("project.titleEn")} value={form.titleEn} onChangeText={(v) => set("titleEn", v)} onSubmitEditing={() => keywordsRef.current?.focus()} />
          <FormField ref={keywordsRef} label={te("project.keywords")} value={form.keywords} onChangeText={(v) => set("keywords", v)} placeholder={te("project.keywordsPlaceholder")} required onSubmitEditing={() => objectiveRef.current?.focus()} />
          <FormField ref={objectiveRef} label={te("project.objective")} value={form.objective} onChangeText={(v) => set("objective", v)} multiline returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => abstractRef.current?.focus()} />
          <FormField ref={abstractRef} label={te("project.abstract")} value={form.abstract} onChangeText={(v) => set("abstract", v)} multiline returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => contributorsRef.current?.focus()} />
          <FormField ref={contributorsRef} label={te("project.contributors")} value={form.contributors} onChangeText={(v) => set("contributors", v)} onSubmitEditing={() => localExpertsRef.current?.focus()} />
          <FormField ref={localExpertsRef} label={te("project.localExperts")} value={form.localExperts} onChangeText={(v) => set("localExperts", v)} onSubmitEditing={() => budgetRef.current?.focus()} />
          <FormField ref={budgetRef} label={te("project.budget")} value={form.budget} onChangeText={(v) => set("budget", v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" placeholder={te("project.budgetPlaceholder")} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} blurOnSubmit />

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
