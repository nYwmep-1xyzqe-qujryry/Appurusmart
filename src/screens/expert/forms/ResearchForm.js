import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppHeader from "../../../components/AppHeader";
import FormContainer from "../../../components/expert/FormContainer";
import KeyboardAwareScrollView from "../../../components/expert/KeyboardAwareScrollView";
import InlineDropdown from "../../../components/expert/InlineDropdown";
import useResource from "../../../hook/useResource";
import useConfirm from "../../../hook/useConfirm";
import useSubmitLock from "../../../hook/useSubmitLock";
import useRefs from "../../../hook/useRefs";
import { sanitizeAcademicText } from "../../../utils/inputSanitize";

const BASE_YEAR_LIST = Array.from({ length: 2569 - 2533 + 1 }, (_, i) => {
  const y = 2569 - i;
  return { id: String(y), label: String(y) };
});

// normalize ref items — ใช้ || แทน ?? เพื่อ skip empty string ด้วย (ไม่ใช่แค่ null/undefined)
const toOpt = (d, i) => ({
  id: String(
    d.id ||
      d.type_id ||
      d.level_id ||
      d.pmu_id ||
      d.research_type_id ||
      d.research_level_id ||
      d.research_pmu_type_id ||
      i,
  ),
  label:
    d.name ||
    d.label ||
    d.type_name ||
    d.research_type_name ||
    d.level_name ||
    d.research_level_name ||
    d.pmu_name ||
    d.research_pmu_type_name ||
    d.name_th ||
    d.name_en ||
    d.title_th ||
    d.title_en ||
    d.title ||
    "",
});

const findLabel = (options, value) => {
  if (value === undefined || value === null || value === "") return "";
  return options.find((o) => String(o.id) === String(value))?.label ?? "";
};

const getResearchTitle = (entry) =>
  entry.name ??
  entry.title ??
  entry.research_name ??
  entry.research_title ??
  entry.research?.name ??
  entry.research?.title ??
  "";

const getResearchTypeId = (entry) =>
  entry.research_type_id ??
  entry.type_id ??
  entry.research_type?.id ??
  entry.type?.id ??
  "";

const getResearchPmuId = (entry) =>
  entry.research_PMU_type_id ??
  entry.research_pmu_type_id ??
  entry.pmu_id ??
  entry.research_PMU_type?.id ??
  entry.research_pmu_type?.id ??
  "";

const getResearchLevelId = (entry) =>
  entry.research_level_id ??
  entry.level_id ??
  entry.research_level?.id ??
  entry.level?.id ??
  "";

const getResearchTypeLabel = (entry, options) =>
  entry.research_type?.name ??
  entry.type?.name ??
  entry.research_type_name ??
  entry.type_name ??
  findLabel(options, getResearchTypeId(entry));

const getResearchPmuLabel = (entry, options) =>
  entry.research_PMU_type?.name ??
  entry.research_pmu_type?.name ??
  entry.pmu_type?.name ??
  entry.research_PMU_type_name ??
  entry.research_pmu_type_name ??
  entry.pmu_name ??
  findLabel(options, getResearchPmuId(entry));

const getResearchLevelLabel = (entry, options) =>
  entry.research_level?.name ??
  entry.level?.name ??
  entry.research_level_name ??
  entry.level_name ??
  findLabel(options, getResearchLevelId(entry));

const ResearchForm = ({ navigation }) => {
  const { t } = useTranslation();
  const YEAR_OPTIONS = useMemo(
    () => [
      { id: "", label: t("research.common.selectYear") },
      ...BASE_YEAR_LIST,
    ],
    [t],
  );
  const { confirm, ConfirmDialog } = useConfirm();
  const submitOnce = useSubmitLock();
  const {
    items,
    loading: loadingItems,
    saving,
    create,
    update,
    remove,
  } = useResource("/researches");
  const {
    researchTypes,
    loading: loadingTypes,
  } = useRefs();
  const tableItems = useMemo(
    () => [...items].sort((a, b) => Number(a.id) - Number(b.id)),
    [items],
  );

  useEffect(() => {
    if (__DEV__ && items.length > 0) {
      console.log("=== [ResearchForm] GET /researches ===");
      console.log("  จำนวน:", items.length);
      console.log("  keys ของ item แรก:", Object.keys(items[0]));
      console.log("  item แรก (full):", JSON.stringify(items[0], null, 2));
      console.log("=====================================");
    }
  }, [items]);

  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    year: "",
    title: "",
    type: "",
    pmu: "",
    level: "",
  });

  const typeOptions = useMemo(
    () => [
      { id: "", label: t("research.researchForm.typePlaceholder") },
      ...researchTypes.map(toOpt),
    ],
    [researchTypes, t],
  );
  /*
  const pmuOptions = useMemo(
    () => [
      { id: "", label: t("research.researchForm.pmuPlaceholder") },
      ...researchPmuTypes.map(toOpt),
    ],
    [researchPmuTypes, t],
  );

  const levelOptions = useMemo(
    () => [
      { id: "", label: t("research.researchForm.levelPlaceholder") },
      ...researchLevels.map(toOpt),
    ],
    [researchLevels, t],
  );
  */

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openEdit = (entry) => {
    setEditingItem(entry);
    setForm({
      year: String(entry.year ?? ""),
      title: getResearchTitle(entry),
      type: String(getResearchTypeId(entry)),
      pmu: String(getResearchPmuId(entry)),
      level: String(getResearchLevelId(entry)),
    });
  };
  const openNew = () => {
    setEditingItem(null);
    setForm({ year: "", title: "", type: "", pmu: "", level: "" });
  };

  const handleSave = () => submitOnce(async () => {
    if (!form.year || !form.title.trim()) {
      Alert.alert(
        t("research.common.warning"),
        t("research.researchForm.validation"),
      );
      return;
    }
    try {
      const payload = {
        year: String(form.year),
        name: form.title.trim(),
        ...(form.type ? { research_type_id: parseInt(form.type, 10) } : {}),
        ...(form.pmu ? { research_PMU_type_id: parseInt(form.pmu, 10) } : {}),
        ...(form.level ? { research_level_id: parseInt(form.level, 10) } : {}),
      };
      if (__DEV__)
        console.log("[ResearchForm] payload:", JSON.stringify(payload));
      editingItem
        ? await update(editingItem.id, payload)
        : await create(payload);
      Alert.alert(
        editingItem
          ? t("research.common.editSuccess")
          : t("research.common.addSuccess"),
        t("research.common.savedMsg"),
      );
      openNew();
    } catch (err) {
      Alert.alert(
        t("research.common.saveFail"),
        err.message ?? t("research.common.apiError"),
      );
    }
  });

  const handleDelete = (entry) => {
    const doDelete = async () => {
      try {
        await remove(entry.id);
      } catch (err) {
        Alert.alert(t("research.common.deleteFail"), err.message);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(t("research.common.deleteConfirm"))) doDelete();
    } else {
      Alert.alert(
        t("research.common.deleteTitle"),
        t("research.common.deleteConfirm"),
        [
          { text: t("research.common.cancel"), style: "cancel" },
          {
            text: t("research.common.deleteBtn"),
            style: "destructive",
            onPress: doDelete,
          },
        ],
      );
    }
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader
        title={t("research.researchForm.title")}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 18,
          paddingBottom: 60,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Hero */}
        <View
          className="flex-row items-center bg-white border border-[#eef1f4] rounded-2xl px-[14px] py-[14px] mb-4"
          style={{ elevation: 1 }}
        >
          <View className="w-11 h-11 rounded-xl bg-[#e6f4ef] items-center justify-center mr-3">
            <Ionicons name="flask" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>
              {t("research.common.manageData")}
            </Text>
            <Text className="text-[20px] font-black text-[#33483f] mt-[2px]">
              {t("research.researchForm.title")}
            </Text>
          </View>
          <View className="bg-[#07865F] rounded-full min-w-9 px-[10px] py-[5px] items-center">
            <Text className="text-white text-[14px] font-black">
              {items.length}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View
          className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
          style={{ elevation: 1 }}
        >
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name="list-outline" size={16} color="#174D42" />
            <Text className="text-[17px] font-extrabold text-[#174D42]" style={{ lineHeight: 24, letterSpacing: 0 }}>
              {t("research.researchForm.listTitle") ??
                t("research.researchForm.title")}
            </Text>
          </View>
          {loadingItems ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">
                {t("research.common.loading")}
              </Text>
            </View>
          ) : items.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">
                {t("research.researchForm.noData")}
              </Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">
                {t("research.common.addBelow")}
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View className="flex-row items-center bg-white border-b border-[#e3e7eb] px-3 py-3">
                  {[
                    { w: 40, label: t("research.common.no") },
                    { w: 86, label: t("research.common.year") },
                    { w: 240, label: t("research.researchForm.colTitle") },
                    { w: 120, label: t("research.researchForm.colType") },
                    { w: 92, label: t("research.common.manage") },
                  ].map((col, i, columns) => (
                    <Text
                      key={i}
                      className="text-[12px] font-extrabold text-[#5F7069] uppercase px-1"
                      style={{
                        width: col.w,
                        textAlign: i === columns.length - 1 ? "center" : "left",
                      }}
                    >
                      {col.label}
                    </Text>
                  ))}
                </View>
                {tableItems.map((entry, index) => {
                  const title = getResearchTitle(entry);
                  const year = entry.year ?? entry.research_year ?? "";
                  const typeLabel = getResearchTypeLabel(entry, typeOptions);
                  return (
                    <View
                      key={entry.id ?? index}
                      className="flex-row items-center px-3 py-3 border-b border-[#eef1f4]"
                      style={[
                        editingItem?.id === entry.id
                          ? { backgroundColor: "#ccf0e2" }
                          : {},
                      ]}
                    >
                      <Text
                        className="text-[15px] font-bold text-[#1f2a2e] text-left px-1"
                        style={{ width: 40 }}
                      >
                        {index + 1}
                      </Text>
                      <View className="px-1" style={{ width: 86 }}>
                        <View className="self-start bg-[#e6f4ef] rounded-full px-[10px] py-[3px]">
                          <Text className="text-[#174D42] text-[13px] font-extrabold">
                            {year || "—"}
                          </Text>
                        </View>
                      </View>
                      <Text
                        className="text-[14px] font-semibold text-[#1f2a2e] leading-5 px-3"
                        style={{
                          width: 240,
                          borderLeftWidth: 1,
                          borderLeftColor: "#eef1f4",
                        }}
                        numberOfLines={3}
                      >
                        {title || "—"}
                      </Text>
                      <Text
                        className="text-[13px] text-[#33483f] px-3"
                        style={{
                          width: 120,
                          borderLeftWidth: 1,
                          borderLeftColor: "#eef1f4",
                        }}
                        numberOfLines={2}
                      >
                        {typeLabel || "—"}
                      </Text>
                      <View
                        className="flex-row gap-[6px] justify-center"
                        style={{ width: 92 }}
                      >
                        <TouchableOpacity
                          className="w-[34px] h-[34px] rounded-lg bg-[#fff0d6] items-center justify-center"
                          onPress={() => openEdit(entry)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="create-outline"
                            size={17}
                            color="#a8631a"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          className="w-[34px] h-[34px] rounded-lg bg-[#fde7e7] items-center justify-center"
                          onPress={() => handleDelete(entry)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={17}
                            color="#df4c4b"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* Form */}
        <View
          className="bg-white border border-[#eef1f4] rounded-2xl pb-[18px]"
          style={{ elevation: 1 }}
        >
          <View className="flex-row items-center justify-between border-b border-[#eef1f4] px-4 py-3 mb-2">
            <View className="flex-row items-center">
              <Ionicons
                name={editingItem ? "create" : "add-circle"}
                size={18}
                color="#07865F"
              />
              <Text className="text-[17px] font-black text-[#33483f] ml-2">
                {editingItem
                  ? t("research.researchForm.editForm")
                  : t("research.researchForm.addForm")}
              </Text>
            </View>
            {editingItem && (
              <View className="flex-row items-center bg-[#fff0d6] rounded-full px-[10px] py-1">
                <Ionicons name="create-outline" size={13} color="#a8631a" />
                <Text className="text-[#a8631a] text-[12px] font-extrabold ml-1">
                  {t("research.common.editing")}
                </Text>
              </View>
            )}
          </View>
          <InlineDropdown
            label={t("research.common.yearField")}
            value={form.year}
            options={YEAR_OPTIONS}
            onSelect={(v) => setField("year", v)}
            required
            searchable
          />
          <View className="px-4 py-2">
            <Text className="text-[14px] font-extrabold text-[#33483f] mb-[6px]">
              {t("research.researchForm.fieldTitle")}
              <Text className="text-[#d83a36]"> *</Text>
            </Text>
            <TextInput
              className="bg-white border border-[#e3e7eb] rounded-[10px] px-[14px] py-[12px] text-[16px] leading-6 text-[#1f2a2e]"
              placeholder={t("research.researchForm.placeholderTitle")}
              placeholderTextColor="#5F7069"
              value={form.title}
              onChangeText={(v) => setField("title", sanitizeAcademicText(v))}
              maxLength={500}
              returnKeyType="done"
              blurOnSubmit
            />
          </View>
          {loadingTypes ? (
            <View className="flex-row items-center gap-[10px] px-4 py-[14px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">
                {t("research.researchForm.loadingTypes")}
              </Text>
            </View>
          ) : (
            <InlineDropdown
              label={t("research.researchForm.fieldType")}
              value={form.type}
              options={typeOptions}
              onSelect={(v) => setField("type", v)}
            />
          )}
          {/* ปิดไว้ชั่วคราว: dropdown PMU และระดับผลงานวิจัยยังไม่ใช้งาน */}
          <View className="flex-row gap-[10px] px-4 pt-[14px]">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]"
              style={{ elevation: 2, opacity: saving ? 0.6 : 1 }}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={editingItem ? "checkmark-circle" : "add-circle"}
                    size={18}
                    color="#fff"
                  />
                  <Text className="text-white text-[15px] font-black">
                    {editingItem
                      ? t("research.common.save")
                      : t("research.common.addData")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center gap-[6px] bg-[#fef2f2] border-[1.5px] border-[#dc2626] rounded-xl px-[18px]"
              onPress={() =>
                confirm({
                  title: t("research.common.resetFormTitle"),
                  message: t("research.common.resetFormMessage"),
                  icon: "refresh",
                  onConfirm: openNew,
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={17} color="#dc2626" />
              <Text className="text-[#dc2626] text-[15px] font-black">
                {t("research.common.reset")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ConfirmDialog />
    </FormContainer>
  );
};

export default ResearchForm;
