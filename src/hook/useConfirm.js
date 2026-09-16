import React, { useCallback, useRef, useState } from "react";
import {
  Animated, Modal, Platform, Text,
  TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadows, typography } from "../theme/tokens";

/**
 * useConfirm — reusable confirm dialog
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *
 *   confirm({
 *     title: "ยืนยันการรีเซ็ต",
 *     message: "ข้อมูลในฟอร์มจะถูกเคลียร์ทั้งหมด",
 *     onConfirm: () => openNew(),
 *     // optional:
 *     confirmText: "ยืนยัน",
 *     cancelText: "ยกเลิก",
 *     icon: "refresh",            // Ionicons name
 *     iconColor: "#dc2626",       // default red
 *     onCancel: () => {},
 *   });
 *
 *   // Mount <ConfirmDialog /> once in the return JSX (any position)
 */
export default function useConfirm() {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState({});
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scaleAnim, { toValue: 1, speed: 28, bounciness: 6, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  };

  const animateOut = (cb) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 130, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(scaleAnim, { toValue: 0.94, duration: 130, useNativeDriver: Platform.OS !== "web" }),
    ]).start(() => cb?.());
  };

  const confirm = useCallback((options) => {
    setOpts(options ?? {});
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.92);
    setVisible(true);
    setTimeout(animateIn, 10);
  }, []);

  const handleCancel = () => {
    animateOut(() => {
      setVisible(false);
      opts.onCancel?.();
    });
  };

  const handleConfirm = () => {
    animateOut(() => {
      setVisible(false);
      opts.onConfirm?.();
    });
  };

  const ConfirmDialog = () => (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={handleCancel}>
        <Animated.View style={{
          flex: 1,
          backgroundColor: "rgba(10,25,18,0.42)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 28,
          opacity: fadeAnim,
        }}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View style={{
              width: "100%",
              maxWidth: 340,
              backgroundColor: "#fff",
              borderRadius: radius.xl,
              overflow: "hidden",
              transform: [{ scale: scaleAnim }],
              ...shadows.floating,
            }}>
              {/* Icon + Title */}
              <View style={{ alignItems: "center", paddingTop: 28, paddingBottom: 16, paddingHorizontal: 24 }}>
                <View style={{
                  width: 54, height: 54, borderRadius: 27,
                  backgroundColor: opts.iconColor ? `${opts.iconColor}18` : colors.surfaceDanger,
                  alignItems: "center", justifyContent: "center", marginBottom: 14,
                }}>
                  <Ionicons
                    name={opts.icon ?? "alert-circle-outline"}
                    size={28}
                    color={opts.iconColor ?? colors.danger}
                  />
                </View>
                <Text style={{ ...typography.sectionTitle, fontWeight: "700", color: colors.text, textAlign: "center" }}>
                  {opts.title ?? "ยืนยัน"}
                </Text>
                {!!opts.message && (
                  <Text style={{ ...typography.secondary, color: colors.textSoft, textAlign: "center", marginTop: 8 }}>
                    {opts.message}
                  </Text>
                )}
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: colors.border }} />

              {/* Buttons */}
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={handleCancel}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, paddingVertical: 15,
                    alignItems: "center", justifyContent: "center",
                    borderRightWidth: 1, borderRightColor: colors.border,
                  }}
                >
                  <Text style={{ ...typography.button, color: colors.textSoft }}>
                    {opts.cancelText ?? "ยกเลิก"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  activeOpacity={0.7}
                  style={{
                    flex: 1, paddingVertical: 15,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{
                    ...typography.button,
                    color: opts.confirmColor ?? colors.danger,
                  }}>
                    {opts.confirmText ?? "ยืนยัน"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return { confirm, ConfirmDialog };
}
