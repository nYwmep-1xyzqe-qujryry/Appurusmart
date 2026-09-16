import React from "react";
import { Linking, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, serviceColors, typography } from "../../theme/tokens";

export default function ContactUsPage() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();

  const SECTIONS = [
    {
      title: t("contact.support"),
      items: [
        { icon: "call-outline",  iconBg: serviceColors.meeting.iconColor, label: t("contact.phone"), value: "090-323-4567",      onPress: () => Linking.openURL("tel:090-323-4567") },
        { icon: "mail-outline",  iconBg: serviceColors.advisor.iconColor, label: t("contact.email"), value: "support@uru.ac.th", onPress: () => Linking.openURL("mailto:support@uru.ac.th") },
      ],
    },
    {
      title: t("contact.workHours"),
      items: [
        { icon: "time-outline",           iconBg: serviceColors.hrms.iconColor, label: t("contact.weekdays"), value: t("contact.weekdaysHours"), onPress: null },
        { icon: "calendar-clear-outline", iconBg: colors.danger, label: t("contact.holiday"),  value: t("contact.holidayValue"), onPress: null },
      ],
    },
    {
      title: t("contact.other"),
      items: [
        { icon: "globe-outline",    iconBg: colors.primary, label: t("contact.website"),  value: "www.uru.ac.th",          onPress: () => Linking.openURL("https://www.uru.ac.th") },
        { icon: "location-outline", iconBg: colors.primary, label: t("contact.location"), value: t("contact.locationValue"), onPress: () => Linking.openURL("https://maps.app.goo.gl/vCDDKADLTq1mhVm19") },
      ],
    },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      <View className="bg-primary flex-row items-center justify-between px-4 pb-[14px]" style={{ paddingTop: top + 10 }}>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-white/20 items-center justify-center" onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ ...typography.sectionTitle, color: colors.surface }}>{t("contact.title")}</Text>
        <View className="w-9" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={{ ...typography.label, color: colors.textMuted, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, textTransform: "uppercase" }}>{section.title}</Text>
            <View className="bg-white mx-4 overflow-hidden" style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border }}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  className="flex-row items-center gap-[14px] px-4 py-[14px]"
                  style={i < section.items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
                  onPress={item.onPress ?? undefined}
                  activeOpacity={item.onPress ? 0.7 : 1}
                  disabled={!item.onPress}
                >
                  <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: item.iconBg }}>
                    <Ionicons name={item.icon} size={20} color="#fff" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ ...typography.label, fontSize: 13, lineHeight: 19 }}>{item.label}</Text>
                    <Text style={{ ...typography.body, fontSize: 16, lineHeight: 24, fontWeight: "600", color: item.onPress ? colors.primary : colors.text, marginTop: 2 }}>{item.value}</Text>
                  </View>
                  {item.onPress && <Ionicons name="chevron-forward" size={16} color="#8a9a90" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View className="flex-row items-start gap-2 mx-4 mt-4 p-[14px]" style={{ backgroundColor: colors.primaryMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text className="flex-1" style={typography.caption}>{t("contact.helpNote")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
