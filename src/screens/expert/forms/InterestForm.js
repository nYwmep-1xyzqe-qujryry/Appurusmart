//ความสนใจ
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import SheetDropdown from "../../../components/expert/SheetDropdown";
import useResource from "../../../hook/useResource";
import useInterestOptions from "../../../hook/useInterestOptions";
import useConfirm from "../../../hook/useConfirm";
import useSubmitLock from "../../../hook/useSubmitLock";
import { getExpertTitle } from "../../../utils/expertFields";
import { sanitizeAcademicText } from "../../../utils/inputSanitize";

const InterestForm = ({ navigation }) => {
  const { t } = useTranslation();
  const { items, saving, create, remove } = useResource("/interests");
  const { confirm, ConfirmDialog } = useConfirm();
  const submitOnce = useSubmitLock();
  const [selectedInterest, setSelectedInterest] = useState("");
  const [customInterest, setCustomInterest] = useState("");
  const { options: rawInterestOptions, loading: loadingOptions } = useInterestOptions();
  const interestOptions = [
    { id: "", label: t("research.interest.selectPlaceholder") },
    ...rawInterestOptions,
  ];

  const handleAdd = () => submitOnce(async () => {
    const title = selectedInterest || customInterest.trim();
    if (!title) {
      Alert.alert(t("research.interest.validation"));
      return;
    }
    if (
      items.some(
        (item) => getExpertTitle(item).toLowerCase() === title.toLowerCase(),
      )
    ) {
      Alert.alert(t("research.interest.duplicate"));
      return;
    }
    try {
      await create({ name: title });
    } catch (err) {
      Alert.alert(
        t("research.common.saveFail"),
        err.message ?? t("research.common.apiError"),
      );
    }
    setSelectedInterest("");
    setCustomInterest("");
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
        title={t("research.interest.title")}
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
        <View
          className="flex-row items-center bg-white border border-[#eef1f4] rounded-2xl px-[14px] py-[14px] mb-4"
          style={{ elevation: 1 }}
        >
          <View className="w-11 h-11 rounded-xl bg-[#e6f4ef] items-center justify-center mr-3">
            <Ionicons name="star" size={22} color="#07865F" />
          </View>
          <View className="flex-1">
            <Text className="text-[12px] font-bold text-[#5F7069] uppercase" style={{ letterSpacing: 0 }}>
              {t("research.common.manageData")}
            </Text>
            <Text className="text-[20px] font-black text-[#33483f] mt-[2px]">
              {t("research.interest.title")}
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
          className="bg-white rounded-2xl border border-[#eef1f4] overflow-hidden mb-4"
          style={{ elevation: 1 }}
        >
          <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
            <Ionicons name="list-outline" size={16} color="#174D42" />
            <Text className="text-[14px] font-extrabold text-[#174D42]">
              {t("research.interest.listHeader")}
            </Text>
          </View>
          <View className="flex-row items-center px-4 py-[10px] bg-white border-b border-[#e3e7eb]">
            <Text
              className="text-[12px] font-extrabold text-[#5F7069] uppercase"
              style={{ width: 50 }}
            >
              {t("research.interest.colNo")}
            </Text>
            <Text className="text-[12px] font-extrabold text-[#5F7069] uppercase flex-1">
              {t("research.interest.colTitle")}
            </Text>
            <Text
              className="text-[12px] font-extrabold text-[#5F7069] uppercase text-center"
              style={{ width: 60 }}
            >
              {t("research.common.deleteBtn")}
            </Text>
          </View>
          {items.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">
                {t("research.interest.noData")}
              </Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">
                {t("research.common.addBelow")}
              </Text>
            </View>
          ) : (
            items.map((entry, index) => (
              <View
                key={entry.id}
                className="flex-row items-center px-4 py-3 border-b border-[#f0f4f7]"
              >
                <Text
                  className="text-[15px] font-bold text-[#1f2a2e] text-center leading-5"
                  style={{ width: 50 }}
                >
                  {index + 1}
                </Text>
                <Text className="text-[15px] font-semibold text-[#1f2a2e] leading-5 flex-1">
                  {getExpertTitle(entry)}
                </Text>
                <View className="items-center" style={{ width: 60 }}>
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
          className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden"
          style={{ elevation: 1 }}
        >
          <View className="flex-row items-center border-b border-[#eef1f4] px-4 py-3 mb-2">
            <Ionicons name="add-circle" size={18} color="#07865F" />
            <Text className="text-[17px] font-black text-[#33483f] ml-2" style={{ lineHeight: 24, letterSpacing: 0 }}>
              {t("research.interest.addHeader")}
            </Text>
          </View>
          <SheetDropdown
            label={t("research.interest.selectExisting")}
            value={selectedInterest}
            options={interestOptions}
            onSelect={(v) => {
              setSelectedInterest(v);
              setCustomInterest("");
            }}
            loading={loadingOptions}
            searchable
          />
          <View className="h-px bg-[#f0f4f7]" />
          <View className="flex-row items-center gap-2 px-4 py-3">
            <View className="flex-1 h-px bg-[#e8ecf0]" />
            <Text className="text-[13px] text-[#666] font-semibold">
              {t("research.interest.orManual")}
            </Text>
            <View className="flex-1 h-px bg-[#e8ecf0]" />
          </View>
          <View className="h-px bg-[#f0f4f7]" />
          <View className="px-4 py-3">
            <Text className="text-[14px] font-semibold text-brand mb-[6px]">
              {t("research.interest.fieldLabel")}
            </Text>
            <TextInput
              className="bg-[#f8fafb] border border-[#e8ecf0] rounded-[10px] px-3 text-[16px] leading-6 text-[#1a1a2e]"
              style={{
                minHeight: 110,
                textAlignVertical: "top",
                paddingTop: 10,
                paddingVertical: 10,
              }}
              value={customInterest}
              onChangeText={(v) => {
                setCustomInterest(sanitizeAcademicText(v));
                setSelectedInterest("");
              }}
              placeholder={t("research.interest.placeholder")}
              placeholderTextColor="#5F7069"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
          <View className="flex-row gap-[10px] p-4 pt-[14px]">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]"
              style={{ elevation: 2, opacity: saving ? 0.6 : 1 }}
              onPress={handleAdd}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text className="text-white text-[15px] font-black">
                    {t("research.interest.addForm")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-[#fef2f2] border-[1.5px] border-[#dc2626] rounded-xl px-[18px] flex-row items-center gap-[6px]"
              onPress={() =>
                confirm({
                  title: t("research.common.resetFormTitle"),
                  message: t("research.common.resetFormMessage"),
                  icon: "refresh",
                  onConfirm: () => {
                    setSelectedInterest("");
                    setCustomInterest("");
                  },
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={16} color="#dc2626" />
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

export default InterestForm;
