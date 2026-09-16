import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radius, typography } from "../../theme/tokens";
import { sanitizeAcademicText } from "../../utils/inputSanitize";

// Dropdown แบบ dialog กลางจอ — เปิดทันทีไม่ต้องรอ measure() ตำแหน่ง trigger
// เหมาะกับกรณีที่ต้องการเปิด-ปิดถี่ๆ โดยไม่มี native bridge latency ของ InlineDropdown
const SheetDropdown = ({
  label,
  value,
  options,
  placeholder,
  onSelect,
  loading = false,
  searchable = false,
  required = false,
  containerClassName = "px-4 py-2",
  triggerStyle,
  triggerTextStyle,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = useMemo(
    () => options.find((o) => String(o.id) === String(value) && o.id !== ""),
    [options, value],
  );

  const handleSelect = useCallback((id) => {
    onSelect(id);
    setSearch("");
    setOpen(false);
  }, [onSelect]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(
      (option) =>
        String(option.label ?? "").toLowerCase().includes(q) ||
        String(option.id ?? "").toLowerCase().includes(q),
    );
  }, [options, search, searchable]);

  const renderOption = useCallback(
    (opt, index) => {
      const isSelected = String(opt.id) === String(value);
      const isPlaceholder = opt.id === "";

      return (
        <TouchableOpacity
          key={`${opt.id}-${index}`}
          className="px-[14px] py-3"
          style={{
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: isSelected ? colors.primarySoft : colors.surface,
          }}
          onPress={() => handleSelect(opt.id)}
          activeOpacity={0.75}
        >
          <View className="flex-row items-center">
            <View className="w-5 items-center mr-[6px]">
              {isSelected && (
                <Ionicons name="checkmark" size={14} color={colors.primary} />
              )}
            </View>
            <Text
              className="flex-1"
              style={{
                ...typography.input,
                color: isSelected
                  ? colors.primary
                  : isPlaceholder
                    ? colors.placeholder
                    : colors.text,
                fontWeight: isSelected ? "600" : "400",
              }}
              numberOfLines={2}
            >
              {opt.label}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelect, value],
  );

  const displayPlaceholder = placeholder ?? options[0]?.label ?? "เลือก...";

  return (
    <View className={containerClassName}>
      {!!label && (
        <Text style={[typography.label, { color: colors.text, marginBottom: 6 }]}>
          {label}
          {required && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
      )}
      <TouchableOpacity
        className="flex-row items-center gap-1"
        style={[{
          minHeight: 48,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: open ? 1.5 : 1,
          borderColor: open ? colors.primary : colors.border,
          backgroundColor: open ? colors.primaryMuted : colors.fieldBg,
        }, triggerStyle]}
        onPress={() => {
          setSearch("");
          setOpen((prev) => !prev);
        }}
        activeOpacity={0.8}
      >
        <Text
          className="flex-1"
          style={[
            typography.input,
            { color: selected ? colors.text : colors.placeholder },
            triggerTextStyle,
          ]}
          numberOfLines={2}
        >
          {selected ? selected.label : displayPlaceholder}
        </Text>
        {loading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
        )}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={open || selected ? colors.primary : colors.placeholder}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-center px-5"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ backgroundColor: "rgba(10, 20, 16, 0.28)" }}
        >
          <TouchableOpacity
            className="absolute inset-0"
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View
            className="bg-white overflow-hidden"
            style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}
          >
            <View
              className="flex-row items-center px-4 py-3"
              style={{ backgroundColor: colors.primarySoft, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text
                className="flex-1"
                style={{ ...typography.input, color: colors.primaryDark, fontWeight: "600" }}
                numberOfLines={2}
              >
                {selected ? selected.label : displayPlaceholder}
              </Text>
              <TouchableOpacity
                className="w-8 h-8 rounded-full items-center justify-center bg-white"
                onPress={() => setOpen(false)}
              >
                <Ionicons name="close" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {searchable && (
              <View
                className="flex-row items-center gap-2 px-3 py-3"
                style={{ backgroundColor: colors.fieldBg, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <View className="w-8 h-8 items-center justify-center" style={{ borderRadius: radius.sm, backgroundColor: colors.primaryMuted }}>
                  <Ionicons name="search-outline" size={15} color={colors.primary} />
                </View>
                <TextInput
                  className="flex-1"
                  style={{ ...typography.input, paddingVertical: 0 }}
                  placeholder={t("research.common.search")}
                  placeholderTextColor={colors.placeholder}
                  value={search}
                  allowFontScaling
                  onChangeText={(text) => setSearch(sanitizeAcademicText(text))}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                {search.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.placeholder} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={({ item, index }) => renderOption(item, index)}
              ListEmptyComponent={
                loading ? (
                  <View className="items-center py-8">
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[typography.caption, { marginTop: 8 }]}>
                      {t("research.common.loading")}
                    </Text>
                  </View>
                ) : (
                  <View className="items-center py-8">
                    <Ionicons name="search-outline" size={28} color={colors.borderStrong} />
                    <Text style={[typography.caption, { marginTop: 8 }]}>
                      {t("research.common.notFound")}
                    </Text>
                  </View>
                )
              }
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              bounces={false}
              initialNumToRender={16}
              maxToRenderPerBatch={16}
              updateCellsBatchingPeriod={16}
              windowSize={7}
              style={{ maxHeight: 360 }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default SheetDropdown;
