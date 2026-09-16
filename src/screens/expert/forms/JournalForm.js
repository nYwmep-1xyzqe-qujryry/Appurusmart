import React, { useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
import { getExpertLink, getExpertTitle, getExpertYear } from "../../../utils/expertFields";
import { sanitizeAcademicText, sanitizeLinkInput } from "../../../utils/inputSanitize";
import { normalizeOptionalUrl } from "../../../utils/url";

const BASE_YEAR_LIST = Array.from({ length: 2569 - 2533 + 1 }, (_, i) => ({
  id: String(2569 - i),
  label: String(2569 - i),
}));
const INIT_FORM = { year: "", reference: "", url: "", database: "" };

const JournalForm = ({ navigation }) => {
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
  const { items, loading, saving, create, update, remove } =
    useResource("/journals");
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(INIT_FORM);
  const { journalTypes } = useRefs();
  const databaseOptions = useMemo(
    () => [
      { id: "", label: t("research.journal.dbPlaceholder") },
      ...journalTypes.map((d, i) => ({
        id: String(d.id || d.journal_type_id || d.type_id || i + 1),
        label:
          d.name || d.label || d.journal_type_name || d.type_name ||
          d.name_th || d.name_en || d.title || "",
      })),
    ],
    [journalTypes, t],
  );

  const urlRef = useRef(null);
  const tableItems = useMemo(
    () => [...items].sort((a, b) => Number(a.id) - Number(b.id)),
    [items],
  );
  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openEdit = (e) => {
    setEditingItem(e);
    setForm({
      year: getExpertYear(e),
      reference: getExpertTitle(e),
      url: getExpertLink(e),
      database: String(e.journal_type_id ?? ""),
    });
  };
  const openNew = () => {
    setEditingItem(null);
    setForm(INIT_FORM);
  };

  const handleSave = () => submitOnce(async () => {
    if (!form.year || !form.reference.trim()) {
      Alert.alert(
        t("research.common.warning"),
        t("research.journal.validation"),
      );
      return;
    }
    if (!form.database) {
      Alert.alert(t("research.common.warning"), t("research.common.selectDatabase"));
      return;
    }
    const normalizedUrl = normalizeOptionalUrl(form.url);
    if (!normalizedUrl.ok) {
      Alert.alert(
        t("research.common.warning"),
        t("research.common.urlInvalid"),
      );
      return;
    }
    const payload = {
      year: String(form.year),
      name: form.reference.trim(),
      url: normalizedUrl.url,
      journal_type_id: parseInt(form.database, 10),
    };
    try {
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
        title={t("research.journal.title")}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 18,
          paddingBottom: 60,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View
          className="flex-row items-center bg-white border border-[#eef1f4] rounded-2xl px-[14px] py-[14px] mb-4"
          style={{ elevation: 1 }}
        >
          <View className="w-11 h-11 rounded-xl bg-[#e6f4ef] items-center justify-center mr-3">
            <Ionicons name="newspaper" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>
              {t("research.award.heroEyebrow")}
            </Text>
            <Text className="text-[19px] font-black text-[#33483f] mt-[2px]">
              {t("research.journal.title")}
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
              {t("research.journal.listTitle")}
            </Text>
          </View>
          {loading ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">
                {t("research.common.loading")}
              </Text>
            </View>
          ) : tableItems.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">
                {t("research.journal.noData")}
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
                    { w: 36, l: t("research.common.no") },
                    { w: 86, l: t("research.common.year") },
                    { w: 220, l: t("research.journal.colRef") },
                    { w: 130, l: t("research.journal.colDb") },
                    { w: 92, l: t("research.common.manage") },
                  ].map((c, i, columns) => (
                    <Text
                      key={i}
                      className="text-[12px] font-extrabold text-[#5F7069] uppercase px-1"
                      style={{
                        width: c.w,
                        textAlign: i === columns.length - 1 ? "center" : "left",
                      }}
                    >
                      {c.l}
                    </Text>
                  ))}
                </View>
                {tableItems.map((entry, index) => (
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
                      className="text-[14px] font-bold text-[#1f2a2e] text-left px-1"
                      style={{ width: 36 }}
                    >
                      {index + 1}
                    </Text>
                    <View className="px-1" style={{ width: 86 }}>
                      <View className="self-start bg-[#e6f4ef] rounded-full px-[10px] py-[3px]">
                        <Text className="text-[#174D42] text-[13px] font-extrabold">
                          {getExpertYear(entry)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="text-[14px] font-semibold text-[#1f2a2e] leading-5 px-3"
                      style={{
                        width: 220,
                        borderLeftWidth: 1,
                        borderLeftColor: "#eef1f4",
                      }}
                      numberOfLines={3}
                    >
                      {getExpertTitle(entry)}
                    </Text>
                    <Text
                      className="text-[13px] text-[#5F7069] px-3"
                      style={{
                        width: 130,
                        borderLeftWidth: 1,
                        borderLeftColor: "#eef1f4",
                      }}
                      numberOfLines={2}
                    >
                      {databaseOptions.find(
                        (o) => o.id === String(entry.journal_type_id ?? ""),
                      )?.label ?? ""}
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
                ))}
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
                  ? t("research.journal.editForm")
                  : t("research.journal.addForm")}
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
              {t("research.journal.fieldRef")}
              <Text className="text-[#d83a36]"> *</Text>
            </Text>
            <TextInput
              className="bg-white border border-[#e3e7eb] rounded-[10px] px-[14px] py-[12px] text-[16px] leading-6 text-[#1f2a2e]"
              value={form.reference}
              onChangeText={(v) => setField("reference", sanitizeAcademicText(v))}
              placeholder={t("research.journal.placeholderRef")}
              placeholderTextColor="#5F7069"
              maxLength={500}
              returnKeyType="next"
              onSubmitEditing={() => urlRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>
          <View className="px-4 py-2">
            <Text className="text-[14px] font-extrabold text-[#33483f] mb-[6px]">
              {t("research.journal.fieldUrl")}
            </Text>
            <TextInput
              ref={urlRef}
              className="bg-white border border-[#e3e7eb] rounded-[10px] py-[12px] px-[14px] text-[16px] leading-6 text-[#1f2a2e]"
              value={form.url}
              onChangeText={(v) => setField("url", sanitizeLinkInput(v))}
              placeholder="https://..."
              placeholderTextColor="#5F7069"
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />
          </View>
          <InlineDropdown
            label={t("research.journal.fieldDb")}
            value={form.database}
            options={databaseOptions}
            onSelect={(v) => setField("database", v)}
            required
          />
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

export default JournalForm;
