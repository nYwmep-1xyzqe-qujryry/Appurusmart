import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, serviceColors, typography } from "../theme/tokens";

const SHOW_MS = 4000;
const SLIDE_OFFSET = -140;

const TYPE_MAP = {
  announcement:   { icon: "megaphone-outline",      color: colors.primary, bg: colors.primaryMuted },
  beforeClass:    { icon: "alarm-outline",           color: serviceColors.meeting.iconColor, bg: serviceColors.meeting.backgroundColor },
  before_class:   { icon: "alarm-outline",           color: serviceColors.meeting.iconColor, bg: serviceColors.meeting.backgroundColor },
  holiday:        { icon: "calendar-clear-outline",  color: colors.warning, bg: colors.surfaceWarning },
  gradeDeadline:  { icon: "document-text-outline",   color: serviceColors.advisor.iconColor, bg: serviceColors.advisor.backgroundColor },
  grade_deadline: { icon: "document-text-outline",   color: serviceColors.advisor.iconColor, bg: serviceColors.advisor.backgroundColor },
};
const DEFAULT_TYPE = { icon: "notifications-outline", color: colors.primary, bg: colors.primaryMuted };

const listeners = new Set();
export const subscribeToast = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const showToast = (notification) => listeners.forEach((cb) => cb(notification));

export default function NotificationToast({ onPress }) {
  const { top } = useSafeAreaInsets();
  const [item, setItem] = useState(null);
  const queue = useRef([]);
  const active = useRef(false);
  const timer = useRef(null);

  const y = useSharedValue(SLIDE_OFFSET);
  const opacity = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    y.value = withSpring(SLIDE_OFFSET, { damping: 20, stiffness: 220 });
    opacity.value = withTiming(0, { duration: 200 }, () =>
      runOnJS(onHidden)()
    );
  }, []);

  const onHidden = useCallback(() => {
    active.current = false;
    setItem(null);
    if (queue.current.length > 0) present(queue.current.shift());
  }, []);

  const present = useCallback((notif) => {
    active.current = true;
    setItem(notif);
    y.value = SLIDE_OFFSET;
    opacity.value = 0;
    y.value = withSpring(0, { damping: 16, stiffness: 160 });
    opacity.value = withTiming(1, { duration: 180 });
    timer.current = setTimeout(hide, SHOW_MS);
  }, [hide]);

  useEffect(() => {
    const unsub = subscribeToast((notif) => {
      if (active.current) queue.current.push(notif);
      else present(notif);
    });
    return () => { unsub(); clearTimeout(timer.current); };
  }, [present]);

  if (!item) return null;

  const data = item.request?.content?.data ?? {};
  const cfg = TYPE_MAP[data.type] ?? DEFAULT_TYPE;
  const title = item.request?.content?.title ?? "";
  const body  = item.request?.content?.body  ?? "";

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: top + 8,
          left: 16,
          right: 16,
          zIndex: 9999,
          elevation: 20,
        },
        animStyle,
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { hide(); onPress?.(item); }}
        style={{
          backgroundColor: colors.surface,
          borderRadius: 18,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: colors.primaryDark,
          shadowOpacity: 0.13,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          overflow: "hidden",
        }}
      >
        {/* accent bar */}
        <View style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
          backgroundColor: cfg.color, borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
        }} />

        {/* icon */}
        <View style={{
          width: 42, height: 42, borderRadius: 12,
          backgroundColor: cfg.bg,
          alignItems: "center", justifyContent: "center",
          marginLeft: 6, flexShrink: 0,
        }}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>

        {/* text */}
        <View style={{ flex: 1, gap: 2 }}>
          {!!title && (
            <Text style={{ ...typography.label, color: colors.text }} numberOfLines={1}>
              {title}
            </Text>
          )}
          {!!body && (
            <Text style={{ ...typography.secondary, color: colors.secondaryText }} numberOfLines={2}>
              {body}
            </Text>
          )}
        </View>

        {/* close */}
        <TouchableOpacity
          onPress={hide}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={{ alignSelf: "flex-start", padding: 2 }}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
