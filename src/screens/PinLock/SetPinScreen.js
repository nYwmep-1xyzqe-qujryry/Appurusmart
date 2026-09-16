import React, { useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PinKeypad from "../../components/PinKeypad";
import { colors, typography } from "../../theme/tokens";
import { setPin } from "../../services/pinService";
import { getCurrentUserId } from "../../services/userSecurityKeys";
import { onLoginSuccess } from "../../services/notificationService";

const PIN_LENGTH = 6;

// หน้าตั้ง PIN บังคับ — ไม่มีปุ่มข้าม ไม่มีปุ่มย้อนกลับ (gestureEnabled: false ที่ navigator)
export default function SetPinScreen({ navigation }) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();

  const [step, setStep] = useState("enter"); // "enter" | "confirm"
  const [firstPin, setFirstPin] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDigit = async (digit) => {
    if (saving || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    setError(false);
    setValue(next);

    if (next.length !== PIN_LENGTH) return;

    if (step === "enter") {
      setTimeout(() => {
        setFirstPin(next);
        setValue("");
        setStep("confirm");
      }, 150);
      return;
    }

    // step === "confirm"
    if (next !== firstPin) {
      setError(true);
      setTimeout(() => {
        setFirstPin("");
        setValue("");
        setStep("enter");
        setError(false);
      }, 700);
      return;
    }

    setSaving(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error("Missing current userId");
      await setPin(userId, next);
      navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
      onLoginSuccess().catch((notificationError) => {
        if (__DEV__) {
          console.warn("[SetPin] notification setup failed:", notificationError?.message);
        }
      });
    } catch (_) {
      setError(true);
      setValue("");
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (saving) return;
    setError(false);
    setValue((prev) => prev.slice(0, -1));
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View
        className="bg-primary px-5 pb-6"
        style={{ paddingTop: top + 24, backgroundColor: colors.primary }}
      >
        <Text style={{ ...typography.pageTitle, color: colors.surface, textAlign: "center" }}>
          {t("security.setPinTitle")}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        <Text style={{ ...typography.body, color: colors.textSoft, marginBottom: 24 }}>
          {step === "enter" ? t("security.pinEnterPrompt") : t("security.pinConfirmPrompt")}
        </Text>

        <PinKeypad
          value={value}
          onDigit={handleDigit}
          onDelete={handleDelete}
          error={error}
          maxLength={PIN_LENGTH}
          belowDots={
            error && (
              <Text style={{ ...typography.secondary, color: colors.danger, fontWeight: "600", textAlign: "center" }}>
                {t("security.pinMismatch")}
              </Text>
            )
          }
        />
      </View>
    </View>
  );
}
