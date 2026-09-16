import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ANNOUNCE_PALETTES } from "../constants/announcePalettes";
import AnnouncementImage from "./AnnouncementImage";
import { normalizeAnnouncements } from "../utils/announcement";
import { colors, typography } from "../theme/tokens";

const CARD_GAP = 12;
const SCROLL_ANIM_MS = 380; // ระยะเวลา animation scroll (ms)

export default function AnnouncementCarousel({ items = [], onViewAll, onPressItem, autoPlayMs = 0 }) {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const announcements = useMemo(() => normalizeAnnouncements(items), [items]);
  const count = announcements.length;

  const scrollRef = useRef(null);
  const scrollXRef = useRef(0);
  const isUserScrolling = useRef(false);
  const [dotIndex, setDotIndex] = useState(0);

  const cardWidth = useMemo(() => {
    if (width >= 900) return Math.min(340, width * 0.34);
    if (width >= 600) return Math.min(300, width * 0.45);
    return Math.min(268, width * 0.68);
  }, [width]);
  const previewHeight = Math.round(cardWidth * 9 / 16);
  const hasImages = announcements.some((item) => item.thumbnailUrl || item.imageUrl);
  const viewAllHeight = hasImages ? previewHeight + 108 : 158;

  // triple array เพื่อ infinite loop ในทั้ง 2 ทิศทาง
  const loopedItems = useMemo(() => {
    if (count <= 1) return announcements;
    return [...announcements, ...announcements, ...announcements];
  }, [announcements, count]);

  const snapUnit = cardWidth + CARD_GAP;

  const scrollToX = (x, animated = true) => {
    scrollRef.current?.scrollTo({ x, animated });
  };

  // เริ่มต้นที่ชุดกลาง (index = count)
  useEffect(() => {
    if (count <= 1 || cardWidth === 0) return;
    const initialX = count * snapUnit;
    const t = setTimeout(() => {
      scrollToX(initialX, false);
      scrollXRef.current = initialX;
    }, 80);
    return () => clearTimeout(t);
  }, [count, cardWidth]);

  // Auto-scroll — อ่านตำแหน่งจริงจาก scrollXRef ทุกครั้ง ไม่ใช้ index ที่แคชไว้
  useEffect(() => {
    if (!autoPlayMs || count <= 1) return;
    const interval = setInterval(() => {
      if (isUserScrolling.current) return;
      const currentIndex = Math.round(scrollXRef.current / snapUnit);
      const next = currentIndex + 1;
      const nextX = next * snapUnit;
      scrollToX(nextX, true);
      setDotIndex(next % count);

      if (next >= count * 2) {
        setTimeout(() => {
          const resetX = (next - count) * snapUnit;
          scrollToX(resetX, false);
          scrollXRef.current = resetX;
        }, SCROLL_ANIM_MS);
      }
    }, autoPlayMs);
    return () => clearInterval(interval);
  }, [autoPlayMs, count, cardWidth]);

  const handleScrollEnd = (e) => {
    if (count <= 1) return;
    isUserScrolling.current = false;
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / snapUnit);
    setDotIndex(index % count);

    if (index < count) {
      setTimeout(() => {
        const resetX = (index + count) * snapUnit;
        scrollToX(resetX, false);
        scrollXRef.current = resetX;
      }, 50);
    } else if (index >= count * 2) {
      setTimeout(() => {
        const resetX = (index - count) * snapUnit;
        scrollToX(resetX, false);
        scrollXRef.current = resetX;
      }, 50);
    }
  };

  const getTitle = (item) => item.title || t("announce.defaultTitle");

  return (
    <LinearGradient colors={[colors.primaryDeep, colors.primaryLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", paddingTop: 16, paddingBottom: 20, overflow: "hidden" }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-[18px] mb-[14px]">
        <View className="flex-row items-center gap-2">
          <View className="w-1 h-5 rounded-[2px]" style={{ backgroundColor: colors.brandYellow }} />
          <Text className="text-white" style={{ ...typography.sectionTitle, color: colors.surface }}>{t("announce.title")}</Text>
        </View>
        <TouchableOpacity
          className="flex-row items-center gap-[3px] rounded-full px-3 py-[5px]"
          style={{ backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}
          activeOpacity={0.75}
          onPress={onViewAll}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Text className="text-white/85" style={{ ...typography.button, fontSize: 14, lineHeight: 20 }}>{t("announce.viewAll")}</Text>
          <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      </View>

      {/* Cards */}
      {count === 0 ? (
        <View className="items-center justify-center py-7 gap-2">
          <Ionicons name="newspaper-outline" size={32} color="rgba(255,255,255,0.4)" />
          <Text className="text-white/50 text-[13px]">{t("announce.empty")}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: CARD_GAP, alignItems: "flex-start" }}
            decelerationRate="fast"
            snapToInterval={cardWidth + CARD_GAP}
            snapToAlignment="start"
            onScroll={(e) => { scrollXRef.current = e.nativeEvent.contentOffset.x; }}
            onScrollBeginDrag={() => { isUserScrolling.current = true; }}
            onMomentumScrollEnd={handleScrollEnd}
            scrollEventThrottle={16}
          >
            {loopedItems.map((item, index) => {
              const realIndex = index % count;
              const palette = ANNOUNCE_PALETTES[realIndex % ANNOUNCE_PALETTES.length];
              const imageUri = item.thumbnailUrl || item.imageUrl;
              const summary = item.sub || item.body;
              return (
                <TouchableOpacity
                  key={`${index}`}
                  activeOpacity={0.88}
                  onPress={() => onPressItem?.(item)}
                  accessibilityRole="button"
                  accessibilityLabel={getTitle(item)}
                  style={{ width: cardWidth }}
                >
                  {imageUri ? (
                    <View style={{ width: "100%", borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                      <AnnouncementImage
                        uri={imageUri}
                        alt={item.imageAlt}
                        cacheKey={item.imageCacheKey}
                        style={{ width: "100%", height: previewHeight }}
                      />

                      <LinearGradient
                        colors={item.colors ?? palette.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ height: 4 }}
                      />

                      <View style={{ padding: 10, minHeight: 78 }}>
                        <View className="flex-row items-center justify-between gap-2 mb-1">
                          <View className="rounded-full px-[8px] py-[3px]" style={{ backgroundColor: colors.brandYellowSoft }}>
                            <Text className="text-[12px] font-semibold" style={{ color: colors.brandYellowDark, lineHeight: 18, letterSpacing: 0 }}>
                              {item.tag ?? t("announce.defaultTag")}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <LinearGradient
                              colors={item.colors ?? palette.colors}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={{ width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
                            >
                              <Ionicons name={item.icon ?? palette.icon} size={16} color="#fff" />
                            </LinearGradient>
                            <Ionicons name="arrow-forward-circle-outline" size={18} color={colors.primary} />
                          </View>
                        </View>

                        <Text style={{ ...typography.body, fontSize: 16, lineHeight: 22, fontWeight: "600" }} numberOfLines={2}>
                          {getTitle(item)}
                        </Text>

                        {!!summary && (
                          <Text style={{ ...typography.secondary, marginTop: 4 }} numberOfLines={1}>
                            {summary}
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <LinearGradient
                      colors={item.colors ?? palette.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ height: 158, borderRadius: 18, padding: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="bg-white/20 rounded-full px-[8px] py-[3px] border border-white/[0.25]">
                          <Text className="text-white text-[12px] font-semibold" style={{ lineHeight: 18, letterSpacing: 0 }}>
                            {item.tag ?? t("announce.defaultTag")}
                          </Text>
                        </View>
                        <View className="w-[34px] h-[34px] rounded-[17px] bg-white/15 border border-white/[0.22] items-center justify-center">
                          <Ionicons name={item.icon ?? palette.icon} size={18} color="rgba(255,255,255,0.95)" />
                        </View>
                      </View>

                      <View className="flex-1 justify-center py-1">
                        <Text className="text-white" style={{ ...typography.body, color: colors.surface, fontSize: 16, lineHeight: 22, fontWeight: "600" }} numberOfLines={2}>
                          {getTitle(item)}
                        </Text>
                        {!!summary && (
                          <Text className="text-white/75" style={{ ...typography.secondary, color: "rgba(255,255,255,0.75)", marginTop: 4 }} numberOfLines={1}>
                            {summary}
                          </Text>
                        )}
                      </View>

                      <View className="items-end">
                        <Ionicons name="arrow-forward-circle-outline" size={18} color="rgba(255,255,255,0.9)" />
                      </View>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* View all card — แสดงท้ายชุดสุดท้ายเท่านั้น */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onViewAll}
              accessibilityRole="button"
              accessibilityLabel={t("announce.viewAll")}
              style={{ width: cardWidth * 0.5, height: viewAllHeight, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}
            >
              <View className="items-center gap-2">
                <View className="w-11 h-11 rounded-full bg-white items-center justify-center">
                  <Ionicons name="grid-outline" size={22} color={colors.primary} />
                </View>
                <Text className="text-white/80" style={{ ...typography.button, fontSize: 14, lineHeight: 20 }}>{t("announce.viewAll")}</Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* Dot indicators */}
          {count > 1 && (
            <View className="flex-row justify-center items-center gap-[5px] mt-[12px]">
              {announcements.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === dotIndex ? 16 : 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: i === dotIndex ? colors.brandYellow : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </View>
          )}
        </>
      )}
    </LinearGradient>
  );
}
