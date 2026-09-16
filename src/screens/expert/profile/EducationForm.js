import React, { useRef, useState, useMemo } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppHeader from "../../../components/AppHeader";
import FormContainer from "../../../components/expert/FormContainer";
import KeyboardAwareScrollView from "../../../components/expert/KeyboardAwareScrollView";
import FormField from "../../../components/expert/FormField";
import InlineDropdown from "../../../components/expert/InlineDropdown";
import useResource from "../../../hook/useResource";
import useConfirm from "../../../hook/useConfirm";
import useSubmitLock from "../../../hook/useSubmitLock";
import useRefs from "../../../hook/useRefs";

const currentYear = new Date().getFullYear() + 543;
const BASE_YEAR_OPTIONS = Array.from({ length: currentYear - 2499 }, (_, i) => {
  const y = currentYear - i;
  return { id: String(y), label: String(y) };
});

const EducationForm = ({ navigation }) => {
  const { t } = useTranslation();
  const { items, loading, saving, create, update, remove } = useResource("/educations");
  const { degrees, loading: loadingDegrees } = useRefs();
  const sortedItems = useMemo(() => [...items].sort((a, b) => Number(a.id) - Number(b.id)), [items]);
  const { confirm, ConfirmDialog } = useConfirm();
  const submitOnce = useSubmitLock();
  const universityRef = useRef(null);
  const YEAR_OPTIONS = useMemo(
    () => [{ id: "", label: t("research.common.selectYear") }, ...BASE_YEAR_OPTIONS],
    [t],
  );
  const DEGREE_OPTIONS = useMemo(
    () => [
      { id: "", label: t("research.education.selectDegree") },
      ...degrees.map((d) => ({ id: String(d.id), label: d.name ?? d.label ?? String(d.id) })),
    ],
    [t, degrees],
  );

  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ year: "", degree: "", course: "", university: "" });

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openNewForm = () => { setEditingItem(null); setForm({ year: "", degree: "", course: "", university: "" }); };
  const openEditForm = (item) => {
    setEditingItem(item);
    const degId = item.degree_id ?? (typeof item.degree === "object" ? item.degree?.id : item.degree);
    setForm({ year: String(item.year ?? ""), degree: String(degId ?? ""), course: item.course ?? "", university: item.university ?? "" });
  };

  const getDegreeLabel = (item) => {
    const degId = String(item.degree_id ?? (typeof item.degree === "object" ? item.degree?.id : item.degree) ?? "");
    return DEGREE_OPTIONS.find((d) => d.id === degId)?.label ?? degId;
  };

  const handleSave = () => submitOnce(async () => {
    if (!form.year || !form.degree || !form.course || !form.university) {
      Alert.alert(t("research.education.validationTitle"), t("research.education.validationMsg")); return;
    }
    try {
      const payload = { degree: parseInt(form.degree, 10), year: form.year, course: form.course.trim(), university: form.university.trim() };
      if (__DEV__) console.log("[EducationForm] payload:", JSON.stringify(payload));
      editingItem ? await update(editingItem.id, payload) : await create(payload);
      Alert.alert(editingItem ? t("research.common.editSuccess") : t("research.common.addSuccess"));
      openNewForm();
    } catch (err) { Alert.alert(t("research.common.saveFail"), err.message ?? t("research.common.apiError")); }
  });

  const handleDelete = (item) => {
    const doDelete = async () => {
      try { await remove(item.id); if (editingItem?.id === item.id) openNewForm(); }
      catch (err) { Alert.alert(t("research.common.deleteFail"), err.message ?? t("research.common.apiError")); }
    };
    if (Platform.OS === "web") {
      if (window.confirm(t("research.common.deleteConfirm"))) doDelete();
    } else {
      Alert.alert(t("research.common.deleteTitle"), t("research.common.deleteConfirm"), [
        { text: t("research.common.cancel"), style: "cancel" },
        { text: t("research.common.deleteBtn"), style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader title={t("research.education.title")} onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 18, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >

        <View className="flex-row items-center bg-white border border-[#eef1f4] rounded-2xl px-[14px] py-[14px] mb-4" style={{ elevation: 1 }}>
          <View className="w-11 h-11 rounded-xl bg-[#e6f4ef] items-center justify-center mr-3">
            <Ionicons name="school" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>{t("research.common.manageData")}</Text>
            <Text className="text-[20px] font-black text-[#33483f] mt-[2px]">{t("research.education.title")}</Text>
          </View>
          <View className="bg-[#07865F] rounded-full min-w-9 px-[10px] py-[5px] items-center">
            <Text className="text-white text-[14px] font-black">{items.length}</Text>
          </View>
        </View>

        {/* List */}
        <View className="bg-white rounded-2xl border border-[#eef1f4] overflow-hidden mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name="list-outline" size={16} color="#174D42" />
            <Text className="text-[17px] font-extrabold text-[#174D42]" style={{ lineHeight: 24, letterSpacing: 0 }}>{t("research.education.listTitle")}</Text>
          </View>
          {loading ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">{t("research.common.loading")}</Text>
            </View>
          ) : sortedItems.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">{t("research.education.noData")}</Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">{t("research.common.addBelow")}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View className="flex-row items-center bg-white border-b border-[#e3e7eb] px-3 py-3">
                  {[
                    { w: 40, l: t("research.common.no") },
                    { w: 86, l: t("research.common.year") },
                    { w: 160, l: t("research.education.degree") },
                    { w: 220, l: t("research.education.course") },
                    { w: 220, l: t("research.education.university") },
                    { w: 92, l: t("research.common.manage") },
                  ].map((c, i, columns) => (
                    <Text
                      key={i}
                      className="text-[12px] font-extrabold text-[#5F7069] uppercase px-1"
                      style={{ width: c.w, textAlign: i === columns.length - 1 ? "center" : "left" }}
                    >
                      {c.l}
                    </Text>
                  ))}
                </View>
                {sortedItems.map((item, index) => (
                  <View
                    key={item.id ?? index}
                    className="flex-row items-center px-3 py-3 border-b border-[#eef1f4]"
                    style={[
                      editingItem?.id === item.id ? { backgroundColor: "#ccf0e2" } : {},
                    ]}
                  >
                    <Text className="text-[15px] font-bold text-[#1f2a2e] text-left px-1" style={{ width: 40 }}>
                      {index + 1}
                    </Text>
                    <View className="px-1" style={{ width: 86 }}>
                      <View className="self-start bg-[#e6f4ef] rounded-full px-[10px] py-[3px]">
                        <Text className="text-[#174D42] text-[13px] font-extrabold">{item.year || "-"}</Text>
                      </View>
                    </View>
                    <Text
                      className="text-[13px] text-[#33483f] px-3"
                      style={{ width: 160, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }}
                      numberOfLines={2}
                    >
                      {getDegreeLabel(item) || "-"}
                    </Text>
                    <Text
                      className="text-[14px] font-semibold text-[#1f2a2e] leading-5 px-3"
                      style={{ width: 220, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }}
                      numberOfLines={3}
                    >
                      {item.course || "-"}
                    </Text>
                    <Text
                      className="text-[13px] text-[#33483f] leading-5 px-3"
                      style={{ width: 220, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }}
                      numberOfLines={3}
                    >
                      {item.university || "-"}
                    </Text>
                    <View className="flex-row gap-[6px] justify-center px-1" style={{ width: 92 }}>
                      <TouchableOpacity className="w-[34px] h-[34px] rounded-lg bg-[#fff0d6] items-center justify-center" onPress={() => openEditForm(item)}>
                        <Ionicons name="create-outline" size={17} color="#a8631a" />
                      </TouchableOpacity>
                      <TouchableOpacity className="w-[34px] h-[34px] rounded-lg bg-[#fde7e7] items-center justify-center" onPress={() => handleDelete(item)}>
                        <Ionicons name="trash-outline" size={17} color="#df4c4b" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* Form */}
        <View className="bg-white border border-[#eef1f4] rounded-2xl pb-[18px]" style={{ elevation: 1 }}>
          <View className="flex-row items-center justify-between border-b border-[#eef1f4] px-4 py-3 mb-2">
            <View className="flex-row items-center">
              <Ionicons name={editingItem ? "create" : "add-circle"} size={18} color="#07865F" />
              <Text className="text-[17px] font-black text-[#33483f] ml-2">{editingItem ? t("research.education.editForm") : t("research.education.addForm")}</Text>
            </View>
          </View>
          <InlineDropdown label={t("research.education.yearGraduated")} value={form.year} options={YEAR_OPTIONS} onSelect={(v) => setField("year", v)} searchable />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <InlineDropdown label={t("research.education.degree")} value={form.degree} options={DEGREE_OPTIONS} onSelect={(v) => setField("degree", v)} loading={loadingDegrees} />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <FormField
            label={t("research.education.course")}
            value={form.course}
            onChangeText={(v) => setField("course", v)}
            onSubmitEditing={() => universityRef.current?.focus()}
          />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <FormField
            ref={universityRef}
            label={t("research.education.university")}
            value={form.university}
            onChangeText={(v) => setField("university", v)}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <View className="flex-row gap-[10px] px-4 pt-[14px]">
            <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]" style={{ elevation: 2, opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <>
                <Ionicons name={editingItem ? "checkmark-circle" : "add-circle"} size={18} color="#fff" />
                <Text className="text-white text-[15px] font-black">{editingItem ? t("research.common.saveEdit") : t("research.education.addForm", { defaultValue: t("research.common.addData") })}</Text>
              </>}
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center gap-[6px] bg-[#fef2f2] border-[1.5px] border-[#dc2626] rounded-xl px-[18px]"
              onPress={() => confirm({ title: t("research.common.resetFormTitle"), message: t("research.common.resetFormMessage"), icon: "refresh", onConfirm: openNewForm })}
            >
              <Ionicons name="refresh" size={16} color="#dc2626" />
              <Text className="text-[#dc2626] text-[15px] font-black">{t("research.common.reset")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ConfirmDialog />
    </FormContainer>
  );
};

export default EducationForm;
