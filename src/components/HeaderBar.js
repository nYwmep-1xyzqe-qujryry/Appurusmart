import React, { useEffect, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, hitSlop, radius } from "../theme/tokens";
import {
  loadNotificationInbox,
  subscribeNotificationInbox,
} from "../services/notificationService";

const logo = require("../assets/urusmartlogo.png");

const HeaderBar = ({ name, photoUrl, onNotification, onLogout }) => {
  const { top } = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => setPhotoFailed(false), [photoUrl]);

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const updateCount = (items, metadata) => {
      const serverCount = Number.isInteger(metadata?.unreadCount)
        ? metadata.unreadCount
        : null;
      if (active) setUnreadCount(serverCount ?? items.filter((item) => !item.read).length);
    };
    const unsubscribe = subscribeNotificationInbox((items, metadata) => {
      receivedUpdate = true;
      updateCount(items, metadata);
    });
    loadNotificationInbox().then((items) => {
      if (!receivedUpdate) updateCount(items);
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "อ.";

  return (
    <View className="px-4 pb-3" style={{ paddingTop: top + 8, backgroundColor: colors.primary }}>
      <View className="flex-row items-center">
        {/* Avatar — fixed width */}
        <View className="w-[40px] h-[40px] rounded-full bg-white/10 border-2 border-white items-center justify-center overflow-hidden">
          {photoUrl && !photoFailed ? (
            <Image
              source={{ uri: photoUrl }}
              className="w-full h-full"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text className="text-white text-[14px] font-extrabold">{initials}</Text>
          )}
        </View>

        {/* Logo — absolute center ทำให้อยู่กลางจริงๆ ไม่ขึ้นกับความกว้างซ้าย-ขวา */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <Image
            source={logo}
            style={{ width: 120, height: 40 }}
            tintColor="#fff"
            resizeMode="contain"
          />
        </View>

        {/* Actions — push to right */}
        <View className="flex-row items-center gap-2 ml-auto">
          <TouchableOpacity
            className="w-10 h-10 items-center justify-center"
            style={{ borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.14)" }}
            onPress={onNotification}
            activeOpacity={0.75}
            hitSlop={hitSlop}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadCount > 0 && (
              <View
                className="absolute -right-1 -top-1 min-w-[18px] h-[18px] rounded-full items-center justify-center px-1"
                style={{ backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.primary }}
              >
                <Text className="text-white text-[10px] font-extrabold">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="w-10 h-10 items-center justify-center"
            style={{ borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.1)" }}
            onPress={onLogout}
            activeOpacity={0.75}
            hitSlop={hitSlop}
          >
            <Ionicons name="log-out-outline" size={19} color="rgba(255,255,255,0.78)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default HeaderBar;
