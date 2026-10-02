import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ANNOUNCE_PALETTES } from "../constants/announcePalettes";
import AnnouncementImage from "./AnnouncementImage";
import { normalizeAnnouncements } from "../utils/announcement";
import {
  clampAnnouncementScrollOffset,
  getAnnouncementCardTone,
  getAnnouncementCardHeight,
  getAnnouncementCardWidth,
  getAnnouncementCategory,
  getAnnouncementDate,
  formatAnnouncementDate,
  getAnnouncementIcon,
  getAnnouncementHomeImageSource,
  getAnnouncementImageFailureKey,
  getAnnouncementLoopContentWidth,
  getAnnouncementLoopItems,
  getAnnouncementLoopIndex,
  getAnnouncementRealIndex,
  getAnnouncementSnapIndex,
  getAnnouncementStableIndex,
  getAnnouncementSummary,
  hasAnnouncementImage,
} from "../utils/announcementCarousel";
import { prefetchAnnouncementImage } from "../utils/announcementImageCache";
import { colors, typography } from "../theme/tokens";

const CARD_GAP = 12;
const CARD_INSET = 16;
const MAX_CAROUSEL_WIDTH = 488;
const EMPTY_ANNOUNCEMENTS = Object.freeze([]);

export default function AnnouncementCarousel({
  items = EMPTY_ANNOUNCEMENTS,
  onViewAll,
  onPressItem,
  autoPlayMs = 0,
  imageRefreshKey = 0,
}) {
  const { width, fontScale } = useWindowDimensions();
  const { t, i18n } = useTranslation();
  const announcements = useMemo(() => normalizeAnnouncements(items), [items]);
  const count = announcements.length;
  const loopedItems = useMemo(() => getAnnouncementLoopItems(announcements), [announcements]);

  const scrollRef = useRef(null);
  const scrollXRef = useRef(0);
  const autoplayTimerRef = useRef(null);
  const settleFrameRef = useRef(null);
  const draggingRef = useRef(false);
  const momentumRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const autoScrollRef = useRef(false);
  const autoTargetRef = useRef(null);
  const allowMomentumRef = useRef(false);
  const [dotIndex, setDotIndex] = useState(0);
  const [activeLoopIndex, setActiveLoopIndex] = useState(count > 1 ? 1 : 0);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [failedImageKeys, setFailedImageKeys] = useState(() => new Set());
  const [eligibleImageKeys, setEligibleImageKeys] = useState(() => new Set());
  const imageRefreshKeyRef = useRef(imageRefreshKey);
  imageRefreshKeyRef.current = imageRefreshKey;

  const carouselWidth = Math.min(measuredWidth || width, MAX_CAROUSEL_WIDTH);
  const cardWidth = getAnnouncementCardWidth(carouselWidth, count);
  const snapUnit = cardWidth + CARD_GAP;
  const expectedContentWidth = count > 0
    ? getAnnouncementLoopContentWidth(cardWidth, loopedItems.length)
    : 0;
  const layoutReady = measuredWidth > 0
    && count > 0
    && Math.abs(contentWidth - expectedContentWidth) <= 1;
  const cardHeight = getAnnouncementCardHeight(cardWidth, fontScale);
  const stackedHeader = carouselWidth < 340 || fontScale >= 1.2;
  const pixelRatio = PixelRatio.get();
  const getRequiredImagePixels = useCallback(() => {
    return {
      width: Math.ceil(cardWidth * pixelRatio),
      height: Math.ceil(cardHeight * pixelRatio),
    };
  }, [cardHeight, cardWidth, pixelRatio]);

  const prefetchNextImage = useCallback(() => {
    if (loopedItems.length === 0) return;

    if (count <= 1) return;

    // Only the next card's thumbnail is warmed. Prefetching every card's
    // full-size imageUrl here downloaded the originals for announcements the
    // user may never open; the detail screen fetches its own original when it
    // is actually opened.
    const currentIndex = getAnnouncementSnapIndex(scrollXRef.current, snapUnit);
    const nextIndex = currentIndex >= loopedItems.length - 1 ? 1 : currentIndex + 1;
    const nextItem = loopedItems[nextIndex];
    if (!nextItem || !hasAnnouncementImage(nextItem)) return;

    const requiredPixels = getRequiredImagePixels(nextItem);
    const { uri } = getAnnouncementHomeImageSource(
      nextItem,
      requiredPixels.width,
      requiredPixels.height,
    );
    void prefetchAnnouncementImage(uri);
  }, [count, getRequiredImagePixels, loopedItems, snapUnit]);

  useEffect(() => {
    const validKeys = new Set(
      announcements
        .filter(hasAnnouncementImage)
        .map(getAnnouncementImageFailureKey),
    );
    setFailedImageKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [announcements]);

  useEffect(() => {
    const validKeys = new Set(
      announcements
        .filter(hasAnnouncementImage)
        .map(getAnnouncementImageFailureKey),
    );
    const nextEligibleKeys = new Set();
    loopedItems.forEach((item, index) => {
      if (layoutReady && hasAnnouncementImage(item) && index === activeLoopIndex) {
        nextEligibleKeys.add(getAnnouncementImageFailureKey(item));
      }
    });
    setEligibleImageKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      nextEligibleKeys.forEach((key) => next.add(key));
      if (next.size === current.size && [...next].every((key) => current.has(key))) return current;
      return next;
    });
  }, [activeLoopIndex, announcements, layoutReady, loopedItems]);

  // A manual Home refresh is the explicit retry action for a transient image
  // failure, including the case where the API returns the same URLs again.
  useEffect(() => {
    setFailedImageKeys(new Set());
  }, [imageRefreshKey]);

  const markImageFailed = useCallback((failureKey, refreshKey) => {
    if (refreshKey !== imageRefreshKeyRef.current) return;
    setFailedImageKeys((current) => {
      if (current.has(failureKey)) return current;
      return new Set(current).add(failureKey);
    });
  }, []);

  const scrollToX = useCallback((x, animated = false) => {
    scrollRef.current?.scrollTo({ x: Math.max(0, x), animated });
  }, []);

  const clearAutoplay = useCallback(() => {
    if (autoplayTimerRef.current != null) clearTimeout(autoplayTimerRef.current);
    autoplayTimerRef.current = null;
  }, []);

  const clearSettleFrame = useCallback(() => {
    if (settleFrameRef.current != null) cancelAnimationFrame(settleFrameRef.current);
    settleFrameRef.current = null;
  }, []);

  const scheduleAutoplay = useCallback(() => {
    clearAutoplay();
    if (!autoPlayMs || count <= 1 || !layoutReady) return;

    autoplayTimerRef.current = setTimeout(() => {
      autoplayTimerRef.current = null;
      if (draggingRef.current || momentumRef.current || !layoutReady) return;

      const currentIndex = getAnnouncementSnapIndex(scrollXRef.current, snapUnit);
      const nextIndex = currentIndex + 1;
      allowMomentumRef.current = true;
      autoScrollRef.current = true;
      pendingScrollRef.current = true;
      autoTargetRef.current = clampAnnouncementScrollOffset(nextIndex * snapUnit, contentWidth, carouselWidth);
      scrollToX(autoTargetRef.current, true);
    }, autoPlayMs);
  }, [autoPlayMs, carouselWidth, clearAutoplay, contentWidth, count, layoutReady, scrollToX, snapUnit]);

  const finishScroll = useCallback((offset) => {
    clearSettleFrame();
    if (!pendingScrollRef.current || count === 0) return;

    const x = Number.isFinite(offset) ? Math.max(0, offset) : scrollXRef.current;
    scrollXRef.current = x;
    pendingScrollRef.current = false;
    autoScrollRef.current = false;
    autoTargetRef.current = null;
    draggingRef.current = false;
    momentumRef.current = false;

    const index = getAnnouncementSnapIndex(x, snapUnit);
    setDotIndex(getAnnouncementRealIndex(index, count));

    if (count === 1) {
      if (index !== 0) scrollToX(0);
      scrollXRef.current = 0;
      setDotIndex(0);
      setActiveLoopIndex(0);
    } else {
      const middleIndex = getAnnouncementLoopIndex(index, count);
      setActiveLoopIndex(middleIndex);
      if (middleIndex !== index) {
        const middleOffset = clampAnnouncementScrollOffset(middleIndex * snapUnit, contentWidth, carouselWidth);
        scrollToX(middleOffset);
        scrollXRef.current = middleOffset;
      }
    }

    scheduleAutoplay();
  }, [carouselWidth, clearSettleFrame, contentWidth, count, scheduleAutoplay, scrollToX, snapUnit]);

  useEffect(() => {
    clearAutoplay();
    clearSettleFrame();
    draggingRef.current = false;
    momentumRef.current = false;
    pendingScrollRef.current = false;
    autoScrollRef.current = false;
    autoTargetRef.current = null;
    allowMomentumRef.current = false;
    scrollXRef.current = 0;
    setDotIndex(0);
    setActiveLoopIndex(count > 1 ? 1 : 0);
    scrollToX(0);

    if (count === 0) {
      setContentWidth(0);
      return undefined;
    }
    if (!layoutReady) return undefined;

    const startIndex = count > 1 ? 1 : 0;
    const startOffset = clampAnnouncementScrollOffset(startIndex * snapUnit, contentWidth, carouselWidth);
    scrollToX(startOffset);
    scrollXRef.current = startOffset;
    return undefined;
  }, [announcements, carouselWidth, clearAutoplay, clearSettleFrame, contentWidth, count, expectedContentWidth, layoutReady, scrollToX, snapUnit]);

  useEffect(() => {
    scheduleAutoplay();
    return clearAutoplay;
  }, [announcements, cardHeight, clearAutoplay, scheduleAutoplay]);

  useEffect(() => () => {
    clearAutoplay();
    clearSettleFrame();
  }, [clearAutoplay, clearSettleFrame]);

  const handleScroll = (event) => {
    const x = event.nativeEvent.contentOffset.x;
    scrollXRef.current = x;

    if (autoScrollRef.current && autoTargetRef.current != null && Math.abs(x - autoTargetRef.current) < 0.5) {
      finishScroll(x);
    }
  };

  const handleScrollBeginDrag = (event) => {
    clearAutoplay();
    clearSettleFrame();
    const x = event.nativeEvent.contentOffset.x;
    scrollXRef.current = x;
    draggingRef.current = true;
    momentumRef.current = false;
    allowMomentumRef.current = true;
    pendingScrollRef.current = true;
    autoScrollRef.current = false;
    autoTargetRef.current = null;
    scrollToX(x);
  };

  const handleScrollEndDrag = (event) => {
    draggingRef.current = false;
    const x = event.nativeEvent.contentOffset.x;
    scrollXRef.current = x;
    clearSettleFrame();
    settleFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = null;
      if (!momentumRef.current) finishScroll(scrollXRef.current);
    });
  };

  const handleMomentumScrollBegin = () => {
    if (!allowMomentumRef.current) return;
    clearAutoplay();
    clearSettleFrame();
    allowMomentumRef.current = false;
    momentumRef.current = true;
    pendingScrollRef.current = true;
  };

  const handleScrollEnd = (event) => {
    finishScroll(event.nativeEvent.contentOffset.x);
  };

  const getTitle = (item) => item.title || t("announce.defaultTitle");

  const renderTextCard = (item, tone, fallbackIcon) => {
    const title = getTitle(item);
    const category = getAnnouncementCategory(item);
    const summary = getAnnouncementSummary({ ...item, title });
    const date = getAnnouncementDate(item)
      ? formatAnnouncementDate(item, i18n.language)
      : "";
    const showSummary = fontScale < 1.3 && Boolean(summary);
    const icon = getAnnouncementIcon(item, fallbackIcon);

    return (
      <View style={{
        width: "100%",
        height: cardHeight,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: tone.background,
        borderWidth: 1,
        borderColor: tone.border,
        padding: 14,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 24, paddingRight: 26 }}>
          <Ionicons name={icon} size={16} color={tone.accent} />
          {!!category && (
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                marginLeft: 6,
                color: tone.accent,
                fontSize: 12,
                lineHeight: fontScale <= 1 ? 16 : undefined,
                fontWeight: "700",
              }}
            >
              {category}
            </Text>
          )}
          {!!date && (
            <Text
              numberOfLines={1}
              style={{
                maxWidth: "46%",
                marginLeft: 8,
                color: tone.title,
                opacity: 0.68,
                fontSize: 11,
                lineHeight: fontScale <= 1 ? 15 : undefined,
              }}
            >
              {date}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, justifyContent: "center", paddingRight: 26 }}>
          <Text
            numberOfLines={2}
            style={{
              color: tone.title,
              fontSize: 16,
              lineHeight: fontScale <= 1 ? 20 : undefined,
              fontWeight: "700",
            }}
          >
            {title}
          </Text>
          {showSummary && (
            <Text
              numberOfLines={2}
              style={{
                marginTop: 4,
                color: tone.title,
                opacity: 0.72,
                fontSize: 12,
                lineHeight: fontScale <= 1 ? 17 : undefined,
              }}
            >
              {summary}
            </Text>
          )}
        </View>
        <Ionicons
          name="arrow-forward"
          size={17}
          color={tone.accent}
          style={{ position: "absolute", right: 14, bottom: 14 }}
        />
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[colors.primaryDeep, colors.primaryLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: "100%", paddingTop: 8, paddingBottom: 10, overflow: "hidden" }}
    >
      <View style={{
        flexDirection: stackedHeader ? "column" : "row",
        alignItems: stackedHeader ? "flex-start" : "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        marginBottom: 8,
        gap: stackedHeader ? 8 : 12,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
          <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: colors.brandYellow }} />
          <Text
            numberOfLines={2}
            style={{
              ...typography.sectionTitle,
              lineHeight: fontScale <= 1 ? typography.sectionTitle.lineHeight : undefined,
              color: colors.surface,
              flexShrink: 1,
            }}
          >
            {t("announce.title")}
          </Text>
        </View>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            borderRadius: 99,
            paddingHorizontal: 12,
            paddingVertical: 5,
            backgroundColor: "rgba(255,255,255,0.12)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
            alignSelf: stackedHeader ? "flex-start" : "auto",
          }}
          activeOpacity={0.75}
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel={t("announce.viewAll")}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Text style={{
            ...typography.button,
            color: "rgba(255,255,255,0.9)",
            fontSize: 14,
            lineHeight: fontScale <= 1 ? 20 : undefined,
          }}>
            {t("announce.viewAll")}
          </Text>
          <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      </View>

      {count === 0 ? (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 6 }}>
          <Ionicons name="newspaper-outline" size={32} color="rgba(255,255,255,0.4)" />
          <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, lineHeight: 18 }}>
            {t("announce.empty")}
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{ width: "100%" }}
            onLayout={(event) => {
              const nextWidth = Math.round(event.nativeEvent.layout.width);
              setMeasuredWidth((current) => current === nextWidth ? current : nextWidth);
            }}
          >
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ width: carouselWidth, alignSelf: "center" }}
              contentContainerStyle={{ paddingHorizontal: CARD_INSET, gap: CARD_GAP, alignItems: "flex-start" }}
              decelerationRate="fast"
              snapToInterval={snapUnit}
              snapToAlignment="start"
              onContentSizeChange={(nextWidth) => setContentWidth(Math.round(nextWidth))}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollBegin={handleMomentumScrollBegin}
              onMomentumScrollEnd={handleScrollEnd}
              onScrollAnimationEnd={() => {
                if (autoScrollRef.current) finishScroll(scrollXRef.current);
              }}
              scrollEventThrottle={16}
            >
              {loopedItems.map((item, index) => {
                const tone = getAnnouncementCardTone({ ...item, title: getTitle(item) });
                const requiredPixels = getRequiredImagePixels(item);
                const { uri: imageUri, fallbackUri } = getAnnouncementHomeImageSource(
                  item,
                  requiredPixels.width,
                  requiredPixels.height,
                );
                const paletteIndex = getAnnouncementStableIndex(item, ANNOUNCE_PALETTES.length);
                const fallbackIcon = getAnnouncementIcon(item, tone.icon || ANNOUNCE_PALETTES[paletteIndex].icon);
                const itemKey = `${item.id ?? paletteIndex}:${index}`;
                const imageFailureKey = getAnnouncementImageFailureKey(item);
                const showImage = hasAnnouncementImage(item) && !failedImageKeys.has(imageFailureKey);
                // Once a card has entered the load window, keep its source
                // mounted while this data/version is active.
                const shouldLoadImage = showImage && eligibleImageKeys.has(imageFailureKey);

                return (
                  <TouchableOpacity
                    key={itemKey}
                    activeOpacity={0.88}
                    onPress={() => onPressItem?.(item)}
                    accessibilityRole="button"
                    accessibilityLabel={getTitle(item)}
                    style={{
                      width: cardWidth,
                      height: cardHeight,
                      borderRadius: 8,
                      shadowColor: "#183D32",
                      shadowOpacity: 0.06,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 1,
                    }}
                  >
                    {showImage ? (
                      <View style={{
                        width: "100%",
                        height: cardHeight,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: tone.background,
                      }}>
                        <AnnouncementImage
                          uri={shouldLoadImage ? imageUri : null}
                          resizeMode="cover"
                          fallbackUri={shouldLoadImage ? fallbackUri : null}
                          fallbackIcon={fallbackIcon}
                          fallbackLabel={getAnnouncementCategory(item, t("announce.defaultTag"))}
                          fallbackColor={tone.accent}
                          fallbackBackground={tone.background}
                          fallbackVariant="home"
                          showFallback={shouldLoadImage}
                          alt={item.imageAlt}
                          cacheKey={item.imageCacheKey}
                          cachePolicy="default"
                          onImageLoad={prefetchNextImage}
                          onImageError={() => markImageFailed(imageFailureKey, imageRefreshKey)}
                          style={{ width: "100%", height: "100%", backgroundColor: tone.background }}
                        />
                      </View>
                    ) : (
                      renderTextCard(item, tone, fallbackIcon)
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {count > 1 && (
            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginTop: 8 }}>
              {announcements.map((item, index) => (
                <View
                  key={`${item.id ?? index}`}
                  style={{
                    width: index === dotIndex ? 16 : 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: index === dotIndex ? colors.brandYellow : "rgba(255,255,255,0.3)",
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
