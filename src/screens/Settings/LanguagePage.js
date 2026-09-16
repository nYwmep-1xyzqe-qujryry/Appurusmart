import React, { useState } from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { changeLanguage } from "../../i18n/i18n";
import { colors, radius, typography } from "../../theme/tokens";
const LANGUAGES = [
  { code: "th", label: "ภาษาไทย",  nativeLabel: "Thai",    flag: "🇹🇭" },
  { code: "en", label: "English",   nativeLabel: "อังกฤษ", flag: "🇬🇧" },
];

export default function LanguagePage() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { top } = useSafeAreaInsets();
  const [selected, setSelected] = useState(i18n.language);

  const handleSelect = async (code) => {
    setSelected(code);
    await changeLanguage(code);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-white/20 items-center justify-center" onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ ...typography.sectionTitle, color: colors.surface }}>{t("language.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ ...typography.label, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: "uppercase" }}>{t("language.select")}</Text>

        <View className="bg-white mx-4 overflow-hidden" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>
          {LANGUAGES.map((lang, i) => {
            const active = selected === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                className="flex-row items-center gap-[14px] px-4 py-4"
                style={{
                  backgroundColor: active ? colors.primaryMuted : colors.surface,
                  ...(i < LANGUAGES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : {}),
                }}
                onPress={() => handleSelect(lang.code)}
                activeOpacity={0.7}
              >
                <Text className="text-[32px]">{lang.flag}</Text>
                <View className="flex-1">
                  <Text style={{ ...typography.body, fontSize: 17, lineHeight: 25, fontWeight: "600", color: active ? colors.primary : colors.text }}>{lang.label}</Text>
                  <Text style={{ ...typography.secondary, marginTop: 2 }}>{lang.nativeLabel}</Text>
                </View>
                {active
                  ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  : <View className="w-6" />
                }
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row items-start gap-2 mx-4 mt-4 p-[14px]" style={{ backgroundColor: colors.primaryMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text className="flex-1" style={typography.caption}>{t("language.note")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
