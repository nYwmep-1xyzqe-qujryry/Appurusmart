import React, { useMemo, useState } from "react";
import {
  View,
  Text,
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
import useExpertGroupOptions from "../../../hook/useExpertGroupOptions";

const ExpertiseForm = ({ navigation, route }) => {
  const { t } = useTranslation();
  const item = route?.params?.item || null;
  const { options: rawExpertGroups, loading: loadingExpertGroups } = useExpertGroupOptions();
  const expertGroups = useMemo(
    () => [{ id: "", label: t("research.expertise.selectGroup") }, ...rawExpertGroups],
    [t, rawExpertGroups],
  );
  const {
    items,
    loading: loadingItems,
    create,
    update,
    remove,
  } = useResource("/expertises");

  const [editingItem, setEditingItem] = useState(item);
  const [form, setForm] = useState({
    group_id: item?.group_id ? String(item.group_id) : "",
  });
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const submitOnce = useSubmitLock();

  const openNew = () => {
    setEditingItem(null);
    setForm({ group_id: "" });
  };

  const openEdit = (e) => {
    setEditingItem(e);
    setForm({ group_id: e.group_id ? String(e.group_id) : "" });
  };

  const handleSave = () => submitOnce(async () => {
    if (!form.group_id) {
      Alert.alert(t("research.common.warning"), t("research.expertise.validation"));
      return;
    }
    const groupLabel =
      expertGroups.find((g) => g.id === form.group_id)?.label ?? "";
    const payload = { group_id: parseInt(form.group_id, 10), name: groupLabel };
    if (__DEV__)
      console.log("[ExpertiseForm] payload:", JSON.stringify(payload));
    setSaving(true);
    try {
      editingItem
        ? await update(editingItem.id, payload)
        : await create(payload);
      Alert.alert(editingItem ? t("research.common.editSuccess") : t("research.common.addSuccess"));
      openNew();
    } catch (err) {
      if (__DEV__) console.warn("[ExpertiseForm] save error:", err.message);
      Alert.alert(
        t("research.common.saveFail"),
        err.message ?? t("research.common.apiError"),
      );
    } finally {
      setSaving(false);
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
      Alert.alert(t("research.common.deleteTitle"), t("research.common.deleteConfirm"), [
        { text: t("research.common.cancel"), style: "cancel" },
        { text: t("research.common.deleteBtn"), style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader title={t("research.expertise.title")} onBack={() => navigation.goBack()} />
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
            <Ionicons name="ribbon" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>
              {t("research.expertise.eyebrow")}
            </Text>
            <Text className="text-[20px] font-black text-[#33483f] mt-[2px]">
              {t("research.expertise.title")}
            </Text>
          </View>
          <View className="bg-[#07865F] rounded-full min-w-9 px-[10px] py-[5px] items-center">
            <Text className="text-white text-[14px] font-black">
              {items.length}
            </Text>
          </View>
        </View>

        {/* List */}
        <View
          className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
          style={{ elevation: 1 }}
        >
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name="list-outline" size={16} color="#174D42" />
              <Text className="text-[17px] font-extrabold text-[#174D42]" style={{ lineHeight: 24, letterSpacing: 0 }}>
              {t("research.expertise.listTitle")}
            </Text>
          </View>
          {loadingItems ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">{t("research.common.loading")}</Text>
            </View>
          ) : items.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">
                {t("research.expertise.noData")}
              </Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">
                {t("research.expertise.addBelow")}
              </Text>
            </View>
          ) : (
            items.map((entry, index) => (
              <View
                key={entry.id ?? index}
                className="flex-row items-center px-[14px] py-3 border-b border-[#eef1f4]"
                style={[
                  editingItem?.id === entry.id
                    ? { backgroundColor: "#ccf0e2" }
                    : {},
                ]}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-[15px] font-semibold text-[#1f2a2e]">
                    {entry.name ||
                      entry.expert_name ||
                      entry.expertise_name ||
                      entry.group_label ||
                      entry.group_name ||
                      ""}
                  </Text>
                </View>
                <View className="flex-row gap-[6px]">
                  <TouchableOpacity
                    className="w-[34px] h-[34px] rounded-lg bg-[#fff0d6] items-center justify-center"
                    onPress={() => openEdit(entry)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={17} color="#a8631a" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="w-[34px] h-[34px] rounded-lg bg-[#fde7e7] items-center justify-center"
                    onPress={() => handleDelete(entry)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={17} color="#df4c4b" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
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
                {editingItem ? t("research.expertise.editForm") : t("research.expertise.addForm")}
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
            label={t("research.expertise.groupLabel")}
            value={form.group_id}
            options={expertGroups}
            onSelect={(v) => setForm((p) => ({ ...p, group_id: v }))}
            loading={loadingExpertGroups}
            required
            searchable
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
                    {editingItem ? t("research.common.save") : t("research.common.addData")}
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

export default ExpertiseForm;
