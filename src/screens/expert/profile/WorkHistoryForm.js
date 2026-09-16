import React, { useRef, useState, useMemo } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppHeader from "../../../components/AppHeader";
import FormContainer from "../../../components/expert/FormContainer";
import KeyboardAwareScrollView from "../../../components/expert/KeyboardAwareScrollView";
import InlineDropdown from "../../../components/expert/InlineDropdown";
import FormField from "../../../components/expert/FormField";
import useResource from "../../../hook/useResource";
import useConfirm from "../../../hook/useConfirm";
import useSubmitLock from "../../../hook/useSubmitLock";

const currentYear = new Date().getFullYear() + 543;
const BASE_YEAR_LIST = Array.from({ length: currentYear - 2529 }, (_, i) => ({ id: String(currentYear - i), label: String(currentYear - i) }));

const WorkHistoryForm = ({ navigation, route }) => {
  const { t } = useTranslation();
  const YEAR_END_OPTIONS = useMemo(() => [{ id: "", label: t("research.common.selectYear") }, { id: "ปัจจุบัน", label: t("research.common.current") }, ...BASE_YEAR_LIST], [t]);
  const { items, loading, saving, create, update, remove } = useResource("/workexes");
  const sortedItems = useMemo(() => [...items].sort((a, b) => Number(a.id) - Number(b.id)), [items]);
  const item = route?.params?.item || null;
  const workplaceRef = useRef(null);

  const { confirm, ConfirmDialog } = useConfirm();
  const submitOnce = useSubmitLock();
  const [editingItem, setEditingItem] = useState(item);
  const [form, setForm] = useState({ position: item?.position || "", workplace: item?.workplace || "", year_start: item?.year_start || "", year_end: item?.year_end || "" });

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openNew = () => { setEditingItem(null); setForm({ position: "", workplace: "", year_start: "", year_end: "" }); };
  const openEdit = (e) => { setEditingItem(e); setForm({ position: e.position, workplace: e.workplace, year_start: e.year_start, year_end: e.year_end }); };

  const handleSave = () => submitOnce(async () => {
    if (!form.position || !form.workplace || !form.year_start || !form.year_end) {
      Alert.alert(t("research.workHistory.validation")); return;
    }
    if (form.year_end !== "ปัจจุบัน" && Number(form.year_start) > Number(form.year_end)) {
      Alert.alert(t("research.common.warning"), t("research.workHistory.invalidYearRange")); return;
    }
    try {
      const payload = { position: form.position, workplace: form.workplace, year_start: form.year_start, year_end: form.year_end };
      editingItem ? await update(editingItem.id, payload) : await create(payload);
      Alert.alert(editingItem ? t("research.common.editSuccess") : t("research.common.addSuccess"), t("research.common.savedMsg"));
      openNew();
    } catch (err) { Alert.alert(t("research.common.saveFail"), err.message ?? t("research.common.apiError")); }
  });

  const handleDelete = (entry) => {
    const doDelete = async () => { try { await remove(entry.id); } catch (err) { Alert.alert(t("research.common.deleteFail"), err.message); } };
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
      <AppHeader title={t("research.workHistory.title")} onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 18, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >

        <View className="flex-row items-center bg-white border border-[#eef1f4] rounded-2xl px-[14px] py-[14px] mb-4" style={{ elevation: 1 }}>
          <View className="w-11 h-11 rounded-xl bg-[#e6f4ef] items-center justify-center mr-3">
            <Ionicons name="briefcase" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>{t("research.common.manageData")}</Text>
            <Text className="text-[20px] font-black text-[#33483f] mt-[2px]">{t("research.workHistory.title")}</Text>
          </View>
          <View className="bg-[#07865F] rounded-full min-w-9 px-[10px] py-[5px] items-center">
            <Text className="text-white text-[14px] font-black">{items.length}</Text>
          </View>
        </View>

        {/* List */}
        <View className="bg-white rounded-2xl border border-[#eef1f4] overflow-hidden mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name="list-outline" size={16} color="#174D42" />
            <Text className="text-[14px] font-extrabold text-[#174D42]">{t("research.workHistory.title")}</Text>
          </View>
          {loading ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">{t("research.common.loading")}</Text>
            </View>
          ) : sortedItems.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">{t("research.workHistory.noData")}</Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">{t("research.common.addBelow")}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View className="flex-row items-center bg-white border-b border-[#e3e7eb] px-3 py-3">
                  {[
                    { w: 40, l: t("research.common.no") },
                    { w: 130, l: t("research.common.period") },
                    { w: 220, l: t("research.workHistory.colPosition") },
                    { w: 220, l: t("research.workHistory.colPlace") },
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
                {sortedItems.map((entry, index) => (
                  <View
                    key={entry.id ?? index}
                    className="flex-row items-center px-3 py-3 border-b border-[#eef1f4]"
                    style={[
                      editingItem?.id === entry.id ? { backgroundColor: "#ccf0e2" } : {},
                    ]}
                  >
                    <Text className="text-[15px] font-bold text-[#1f2a2e] text-left px-1" style={{ width: 40 }}>
                      {index + 1}
                    </Text>
                    <View className="px-1" style={{ width: 130 }}>
                      <View className="self-start bg-[#e6f4ef] rounded-full px-[10px] py-[3px]">
                        <Text className="text-[#174D42] text-[13px] font-extrabold">
                          {entry.year_start || "-"} - {entry.year_end || "-"}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="text-[14px] font-semibold text-[#1f2a2e] leading-5 px-3"
                      style={{ width: 220, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }}
                      numberOfLines={3}
                    >
                      {entry.position || "-"}
                    </Text>
                    <Text
                      className="text-[13px] text-[#33483f] leading-5 px-3"
                      style={{ width: 220, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }}
                      numberOfLines={3}
                    >
                      {entry.workplace || "-"}
                    </Text>
                    <View className="flex-row gap-[6px] justify-center px-1" style={{ width: 92 }}>
                      <TouchableOpacity className="w-[34px] h-[34px] rounded-lg bg-[#fff0d6] items-center justify-center" onPress={() => openEdit(entry)}>
                        <Ionicons name="create-outline" size={17} color="#a8631a" />
                      </TouchableOpacity>
                      <TouchableOpacity className="w-[34px] h-[34px] rounded-lg bg-[#fde7e7] items-center justify-center" onPress={() => handleDelete(entry)}>
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
              <Text className="text-[17px] font-black text-[#33483f] ml-2">{editingItem ? t("research.workHistory.editForm") : t("research.workHistory.addForm")}</Text>
            </View>
          </View>
          <FormField
            label={t("research.workHistory.colPosition")}
            value={form.position}
            onChangeText={(v) => setField("position", v)}
            onSubmitEditing={() => workplaceRef.current?.focus()}
          />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <FormField
            ref={workplaceRef}
            label={t("research.workHistory.colPlace")}
            value={form.workplace}
            onChangeText={(v) => setField("workplace", v)}
            returnKeyType="done"
          />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <InlineDropdown label={t("research.workHistory.colStart")} value={form.year_start} options={YEAR_END_OPTIONS} onSelect={(v) => setField("year_start", v)} searchable />
          <View className="h-px bg-[#f0f4f7] my-[10px]" />
          <InlineDropdown label={t("research.workHistory.colEnd")} value={form.year_end} options={YEAR_END_OPTIONS} onSelect={(v) => setField("year_end", v)} searchable />
          <View className="flex-row gap-[10px] px-4 pt-[14px]">
            <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]" style={{ elevation: 2, opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <>
                <Ionicons name={editingItem ? "checkmark-circle" : "add-circle"} size={18} color="#fff" />
                <Text className="text-white text-[15px] font-black">{editingItem ? t("research.common.saveEdit") : t("research.workHistory.addForm")}</Text>
              </>}
            </TouchableOpacity>
            <TouchableOpacity className="flex-row items-center gap-[6px] bg-[#fef2f2] border-[1.5px] border-[#dc2626] rounded-xl px-[18px]" onPress={() => confirm({ title: t("research.common.resetFormTitle"), message: t("research.common.resetFormMessage"), icon: "refresh", onConfirm: openNew })}>
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

export default WorkHistoryForm;
