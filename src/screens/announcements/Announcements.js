import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  PanResponder,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import ReAnimated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ANNOUNCE_PALETTES } from "../../constants/announcePalettes";
import AnnouncementImage from "../../components/AnnouncementImage";
import AnnouncementImageViewer from "../../components/AnnouncementImageViewer";
import useFetch from "../../hook/useFetch";
import { getAnnouncementRows, normalizeAnnouncement, normalizeAnnouncements } from "../../utils/announcement";
import { normalizeOptionalUrl } from "../../utils/url";
import { colors as themeColors, radius, shadows, typography } from "../../theme/tokens";

const SHEET_H = Dimensions.get("window").height * 0.72;

// ── List card ─────────────────────────────────────────────
const AnnouncementItem = ({ item, index, highlighted, defaultTag, defaultTitle, onPress }) => {
  const announcement = normalizeAnnouncement(item, defaultTitle);
  const palette = ANNOUNCE_PALETTES[index % ANNOUNCE_PALETTES.length];
  const title = announcement.title || defaultTitle;
  const summary = announcement.sub || announcement.body;
  const imageUri = announcement.thumbnailUrl || announcement.imageUrl;

  return (
    <ReAnimated.View entering={FadeInDown.delay(index * 60).springify().damping(14)}>
      <TouchableOpacity
        className="bg-white rounded-[18px] overflow-hidden border"
        activeOpacity={0.82}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={{
          borderColor: highlighted ? themeColors.primary : themeColors.border,
          elevation: highlighted ? 5 : 2,
          shadowColor: themeColors.primaryDark,
          shadowOpacity: highlighted ? 0.18 : 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <LinearGradient
          colors={item.colors ?? palette.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 4 }}
        />

        <View className="p-[14px]">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
            <View className="flex-row items-center gap-2 mb-[6px]">
              <View style={{ backgroundColor: themeColors.brandYellowSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: themeColors.brandYellowDark, fontSize: 11, lineHeight: 17, fontWeight: "500", letterSpacing: 0 }}>{announcement.tag ?? defaultTag}</Text>
              </View>
              {!!(announcement.date ?? announcement.published_at ?? announcement.created_at) && (
                <Text style={{ color: themeColors.textMuted, fontSize: 11, lineHeight: 17, fontWeight: "400", letterSpacing: 0 }}>
                  {announcement.date ?? announcement.published_at ?? announcement.created_at}
                </Text>
              )}
            </View>
            <Text style={{ ...typography.body, fontSize: 16, lineHeight: 22, fontWeight: "600" }} numberOfLines={2}>
              {title}
            </Text>
            {!!summary && (
              <Text style={{ ...typography.secondary, marginTop: 4 }} numberOfLines={2}>
                {summary}
              </Text>
            )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {imageUri ? (
                <AnnouncementImage
                  uri={imageUri}
                  alt={announcement.imageAlt}
                  cacheKey={announcement.imageCacheKey}
                  style={{ width: 88, height: 66, borderRadius: radius.md }}
                />
              ) : (
                <LinearGradient
                  colors={announcement.colors ?? palette.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name={announcement.icon ?? palette.icon} size={22} color="rgba(255,255,255,0.95)" />
                </LinearGradient>
              )}
              <Ionicons name="chevron-forward" size={16} color={themeColors.borderStrong} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </ReAnimated.View>
  );
};

// ── Bottom Sheet Detail ────────────────────────────────────
const AnnouncementDetailModal = ({ item, defaultTag, defaultTitle, onClose }) => {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(SHEET_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [linkError, setLinkError] = useState(null);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    setImageViewerVisible(false);
    setLinkError(null);
  }, [item]);

  // Open animation each time a new item is selected
  useEffect(() => {
    if (!item) return;
    translateY.setValue(SHEET_H);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 58, friction: 11 }),
      Animated.timing(backdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [item]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_H, duration: 260, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onCloseRef.current());
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          Animated.parallel([
            Animated.timing(translateY, { toValue: SHEET_H, duration: 260, useNativeDriver: true }),
            Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        }
      },
    })
  ).current;

  if (!item) return null;

  const announcement = normalizeAnnouncement(item, defaultTitle);
  const title = announcement.title || defaultTitle;
  const body = announcement.body;
  const tag = announcement.tag ?? defaultTag;
  const icon = announcement.icon ?? ANNOUNCE_PALETTES[0].icon;
  const colors = announcement.colors ?? ANNOUNCE_PALETTES[0].colors;
  const imageUri = announcement.imageUrl || announcement.thumbnailUrl;
  const imageRatio = announcement.imageWidth && announcement.imageHeight
    ? Math.min(2.2, Math.max(0.7, announcement.imageWidth / announcement.imageHeight))
    : 16 / 9;
  const sourceUrl = typeof announcement.url === "string" ? announcement.url.trim() : "";
  const hasUrl = sourceUrl !== "";
  const normalizedUrl = normalizeOptionalUrl(sourceUrl);

  const formatDate = (ds) => {
    if (!ds) return null;
    try {
      const d = new Date(ds);
      if (isNaN(d.getTime())) return ds;
      const day = d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
      const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      return `${day} • ${time} น.`;
    } catch { return ds; }
  };
  const dateValue = announcement.published_at ?? announcement.created_at ?? announcement.date;
  const dateStr = announcement.published_at || announcement.created_at
    ? formatDate(dateValue)
    : (announcement.date ?? null);

  const handleShare = async () => {
    try {
      const msg = [title, body, normalizedUrl.ok ? normalizedUrl.url : null].filter(Boolean).join("\n\n");
      await Share.share({ message: msg, title });
    } catch (_) {}
  };

  const handleOpenUrl = async () => {
    setLinkError(null);
    if (!normalizedUrl.ok || !normalizedUrl.url) {
      setLinkError(t("announce.invalidLink"));
      return;
    }

    try {
      const supported = await Linking.canOpenURL(normalizedUrl.url);
      if (!supported) throw new Error("URL is not supported");
      await Linking.openURL(normalizedUrl.url);
    } catch (_) {
      setLinkError(t("announce.linkOpenFailed"));
    }
  };

  return (
    <>
      <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={dismiss}>
      {/* Dimmed backdrop — tap to close */}
      <TouchableWithoutFeedback onPress={dismiss}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.52)", opacity: backdrop }]}
        />
      </TouchableWithoutFeedback>

      {/* Sheet positioned at bottom */}
      <View style={{ flex: 1, justifyContent: "flex-end", pointerEvents: "box-none" }}>
        <Animated.View
          style={{
            height: SHEET_H,
            backgroundColor: themeColors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            elevation: 24,
            shadowColor: themeColors.primaryDark,
            shadowOpacity: 0.22,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -6 },
            transform: [{ translateY }],
            overflow: "hidden",
          }}
        >
          {/* Drag handle */}
          <View
            {...panResponder.panHandlers}
            style={{ alignItems: "center", paddingTop: 12, paddingBottom: 10 }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: themeColors.borderStrong }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            bounces
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* ── Hero ── */}
            <View style={{ alignItems: "center", paddingHorizontal: 24, paddingTop: 4, paddingBottom: 22, gap: 14 }}>
              {imageUri ? (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => setImageViewerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="เปิดภาพข่าวสารแบบเต็มหน้าจอ"
                  style={{ width: "100%" }}
                >
                  <AnnouncementImage
                    uri={imageUri}
                    alt={announcement.imageAlt}
                    resizeMode="contain"
                    cacheKey={announcement.imageCacheKey}
                    style={{ width: "100%", aspectRatio: imageRatio, maxHeight: 190, borderRadius: 18 }}
                  />
                </TouchableOpacity>
              ) : (
                <LinearGradient
                  colors={colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 26,
                    alignItems: "center",
                    justifyContent: "center",
                    elevation: 4,
                    shadowColor: colors[1],
                    shadowOpacity: 0.35,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <Ionicons name={icon} size={38} color="rgba(255,255,255,0.97)" />
                </LinearGradient>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <View style={{ backgroundColor: themeColors.brandYellowSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ color: themeColors.brandYellowDark, fontSize: 12, lineHeight: 18, fontWeight: "500", letterSpacing: 0 }}>{tag}</Text>
                </View>
                {!!dateStr && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color={themeColors.textMuted} />
                    <Text style={{ color: themeColors.textMuted, fontSize: 12, lineHeight: 18, fontWeight: "400", letterSpacing: 0 }}>{dateStr}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Title ── */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 18 }}>
              <Text style={{ ...typography.pageTitle, color: themeColors.text, fontSize: 22, lineHeight: 30 }}>
                {title}
              </Text>
            </View>

            {/* ── Divider ── */}
            <View style={{ height: 1, backgroundColor: themeColors.border, marginHorizontal: 24, marginBottom: 20 }} />

            {/* ── Body ── */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
              {body ? (
                <Text style={{ ...typography.body, color: themeColors.text, lineHeight: 27 }}>
                  {body}
                </Text>
              ) : (
                <View style={{ alignItems: "center", paddingTop: 16, paddingBottom: 8, gap: 12 }}>
                  <View style={{
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    backgroundColor: themeColors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: themeColors.border,
                  }}>
                    <Ionicons name="mail-open-outline" size={38} color={themeColors.borderStrong} />
                  </View>
                  <Text style={{ ...typography.sectionTitle, color: themeColors.text, textAlign: "center" }}>
                    {t("announce.detailEmpty")}
                  </Text>
                  <Text style={{ ...typography.secondary, textAlign: "center", lineHeight: 22, maxWidth: 250 }}>
                    {t("announce.detailEmptySub")}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* ── Footer actions ── */}
          {linkError && (
            <Text style={{ color: themeColors.danger, fontSize: 13, lineHeight: 19, fontWeight: "600", letterSpacing: 0, paddingHorizontal: 20, paddingTop: 10, textAlign: "center" }}>
              {linkError}
            </Text>
          )}

          <View style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(bottom, 16),
            borderTopWidth: 1,
            borderTopColor: themeColors.border,
          }}>
            {hasUrl && (
              <TouchableOpacity
                onPress={handleOpenUrl}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: radius.md,
                  backgroundColor: themeColors.primary,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="open-outline" size={17} color="#fff" />
                <Text style={{ ...typography.button, color: themeColors.surface, fontSize: 15 }}>{t("announce.readMore")}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.85}
              style={{
                flex: hasUrl ? 0 : 1,
                width: hasUrl ? 48 : undefined,
                height: 48,
                borderRadius: radius.md,
                backgroundColor: themeColors.primaryMuted,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: hasUrl ? 0 : 6,
              }}
            >
              <Ionicons name="share-social-outline" size={19} color={themeColors.primary} />
              {!hasUrl && (
                <Text style={{ ...typography.button, color: themeColors.primary, fontSize: 15 }}>{t("announce.share")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={dismiss}
              activeOpacity={0.85}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.md,
                backgroundColor: themeColors.primaryMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={20} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
      </Modal>
      <AnnouncementImageViewer
        visible={imageViewerVisible}
        uri={imageUri}
        alt={announcement.imageAlt}
        imageWidth={announcement.imageWidth}
        imageHeight={announcement.imageHeight}
        cacheKey={announcement.imageCacheKey}
        onClose={() => setImageViewerVisible(false)}
      />
    </>
  );
};

// ── Screen ─────────────────────────────────────────────────
export default function AnnouncementsScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const { data: fetched, loading } = useFetch("/announcements", { initialData: [] });
  const fetchedItems = getAnnouncementRows(fetched);
  const seedItems = getAnnouncementRows(route.params?.items);
  const items = normalizeAnnouncements(
    fetchedItems.length ? fetchedItems : seedItems,
    t("announce.defaultTitle"),
  );
  const highlightId = route.params?.highlightId ?? null;
  const [selected, setSelected] = useState(route.params?.selectedItem ?? null);

  const selectItem = useCallback((item, index) => {
    const palette = ANNOUNCE_PALETTES[index % ANNOUNCE_PALETTES.length];
    const announcement = normalizeAnnouncement(item, t("announce.defaultTitle"));
    setSelected({
      ...announcement,
      colors: announcement.colors ?? palette.colors,
      icon: announcement.icon ?? palette.icon,
    });
  }, [t]);

  return (
    <View className="flex-1" style={{ backgroundColor: themeColors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={themeColors.primaryDark} />

      <LinearGradient
        colors={[themeColors.primaryDark, themeColors.primary]}
        style={{ paddingTop: top + 10, paddingBottom: 18, paddingHorizontal: 16 }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            className="w-[38px] h-[38px] rounded-xl items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-[21px] font-bold" style={{ lineHeight: 29, letterSpacing: 0 }}>{t("announce.title")}</Text>
            <Text className="text-white/70 text-[13px] mt-[2px]" style={{ lineHeight: 19, fontWeight: "400", letterSpacing: 0 }}>
              {loading ? t("announce.loading") : t("announce.itemCount", { count: items.length })}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          ) : (
            <View className="bg-white/15 rounded-full px-3 py-[5px]">
              <Text className="text-white text-[12px] font-semibold" style={{ lineHeight: 18, letterSpacing: 0 }}>
                {t("announce.itemCount", { count: items.length })}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.id ?? index}`}
        renderItem={({ item, index }) => (
          <AnnouncementItem
            item={item}
            index={index}
            highlighted={highlightId != null && String(item.id) === String(highlightId)}
            defaultTag={t("announce.defaultTag")}
            defaultTitle={t("announce.defaultTitle")}
            onPress={() => navigation.navigate("AnnouncementDetail", {
              announcementId: item.id,
              announcement: item,
            })}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36, gap: 10 }}
        ListEmptyComponent={
          <ReAnimated.View entering={FadeInDown.springify()} className="items-center justify-center pt-20 gap-4">
            <View className="w-24 h-24 rounded-full bg-white items-center justify-center" style={{ borderWidth: 1, borderColor: themeColors.border, elevation: 2 }}>
              <Ionicons name="newspaper-outline" size={44} color={themeColors.borderStrong} />
            </View>
            <Text style={{ ...typography.sectionTitle, color: themeColors.text }}>{t("announce.empty")}</Text>
            <Text style={typography.secondary}>{t("announce.emptySub")}</Text>
          </ReAnimated.View>
        }
      />

      <AnnouncementDetailModal
        item={selected}
        defaultTag={t("announce.defaultTag")}
        defaultTitle={t("announce.defaultTitle")}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
