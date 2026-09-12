import React, { useState } from "react";
import { StatusBar, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PinKeypad from "../../components/PinKeypad";
import { colors } from "../../theme/tokens";
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
    <View className="flex-1 bg-[#eaf5ef]">
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View
        className="bg-primary px-5 pb-6"
        style={{ paddingTop: top + 24, backgroundColor: colors.primary }}
      >
        <Text className="text-white text-[20px] font-extrabold text-center">
          {t("security.setPinTitle")}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-[15px] font-semibold text-[#5f746b] mb-6">
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
              <Text className="text-[13px] font-semibold text-[#dc2626] text-center">
                {t("security.pinMismatch")}
              </Text>
            )
          }
        />
      </View>
    </View>
  );
}
