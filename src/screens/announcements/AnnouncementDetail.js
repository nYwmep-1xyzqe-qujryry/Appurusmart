import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnnouncementImage from "../../components/AnnouncementImage";
import AnnouncementImageViewer from "../../components/AnnouncementImageViewer";
import AppHeader from "../../components/AppHeader";
import StateView from "../../components/StateView";
import { ANNOUNCE_PALETTES } from "../../constants/announcePalettes";
import api from "../../services/api";
import { colors, hitSlop, radius, typography } from "../../theme/tokens";
import {
  getAnnouncementRecord,
  getAnnouncementDetailPreviewSize,
  normalizeAnnouncement,
} from "../../utils/announcement";
import { normalizeOptionalUrl } from "../../utils/url";

// Wider than this and the preview gets too short to read; narrower and the
// side crop starts cutting into banner content.
const DETAIL_FRAME_ASPECT_RATIO = 2.6;

const getErrorKind = (error) => {
  const status = error?.response?.status;
  if (status === 403) return "forbidden";
  if (status === 404 || status === 410) return "notFound";
  return "load";
};

const isUnavailableAnnouncement = (record) => {
  if (!record || typeof record !== "object") return true;
  if (record.deleted_at || record.deletedAt) return true;
  if (record.is_published === false || record.isPublished === false) return true;
  if (record.published === false) return true;
  const status = String(record.status ?? "").trim().toLowerCase();
  return ["deleted", "draft", "unpublished", "cancelled", "canceled"].includes(status);
};

const formatDate = (value, language) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(language === "th" ? "th-TH" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return String(value);
  }
};

const getAnnouncementUrl = (announcement) => {
  const value = announcement?.url
    ?? announcement?.link_url
    ?? announcement?.linkUrl
    ?? announcement?.source_url
    ?? announcement?.sourceUrl
    ?? announcement?.original_url
    ?? announcement?.originalUrl
    ?? announcement?.link;
  return typeof value === "string" ? value.trim() : "";
};

export default function AnnouncementDetail({ navigation, route }) {
  const { t, i18n } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const routeAnnouncement = route.params?.announcement ?? null;
  const announcementId = route.params?.announcementId
    ?? routeAnnouncement?.id
    ?? routeAnnouncement?.announcement_id
    ?? null;
  const seededAnnouncement = useMemo(() => {
    const record = getAnnouncementRecord(routeAnnouncement);
    return record ? normalizeAnnouncement(record, t("announce.defaultTitle")) : null;
  }, [routeAnnouncement, t]);

  const [announcement, setAnnouncement] = useState(seededAnnouncement);
  const [loading, setLoading] = useState(announcementId != null);
  const [errorKind, setErrorKind] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [linkError, setLinkError] = useState(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [loadedImageSize, setLoadedImageSize] = useState(null);
  const requestId = useRef(0);

  const loadAnnouncement = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLinkError(null);

    if (announcementId == null) {
      setAnnouncement(seededAnnouncement);
      setErrorKind(seededAnnouncement ? null : "notFound");
      setRefreshError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorKind(null);
    setRefreshError(null);

    try {
      const response = await api.get(
        `/announcements/${encodeURIComponent(announcementId)}`,
        { suppressErrorLog: true },
      );
      const recordPayload = response.data?.data ?? response.data;
      const record = getAnnouncementRecord(recordPayload);
      if (__DEV__) {
        // Shape and identifiers only — the full record and the image URL can
        // carry personal data or a signed URL, so neither is logged.
        console.log("[announcements:detail] response", {
          status: response.status,
          announcementId,
          hasRecord: Boolean(record),
          hasImage: Boolean(record?.image_url || record?.thumbnail_url),
        });
      }
      if (isUnavailableAnnouncement(record)) {
        const emptyResponseError = new Error("Announcement detail is empty");
        emptyResponseError.response = { status: 404 };
        throw emptyResponseError;
      }

      const normalized = normalizeAnnouncement(
        { ...record, id: record.id ?? record.announcement_id ?? announcementId },
        t("announce.defaultTitle"),
      );
      if (currentRequest !== requestId.current) return;
      setAnnouncement(normalized);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const kind = getErrorKind(error);
      if ((kind === "load" || kind === "notFound") && seededAnnouncement) {
        setAnnouncement(seededAnnouncement);
        setRefreshError(t("announce.detailRefreshFailed"));
        setErrorKind(null);
      } else {
        setAnnouncement(null);
        setErrorKind(kind);
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [announcementId, seededAnnouncement, t]);

  useEffect(() => {
    // รายการข่าวส่งข้อมูลมาแล้ว จึงเปิดอ่านได้ทันที ส่วน Push ที่มีเฉพาะ ID
    // จะค้นจาก endpoint รายการข่าวเดิมเพื่อรองรับ backend ที่ยังไม่มี detail route
    if (seededAnnouncement) {
      setAnnouncement(seededAnnouncement);
      setErrorKind(null);
      setRefreshError(null);
      setLoading(false);
      return;
    }
    loadAnnouncement();
  }, [loadAnnouncement, seededAnnouncement]);

  const title = announcement?.title || t("announce.defaultTitle");
  const body = announcement?.body || "";
  const tag = announcement?.tag ?? announcement?.category ?? t("announce.defaultTag");
  const announcementNumber = Number(announcement?.id);
  const paletteIndex = Number.isFinite(announcementNumber)
    ? Math.abs(announcementNumber) % ANNOUNCE_PALETTES.length
    : 0;
  const palette = announcement ? ANNOUNCE_PALETTES[paletteIndex] : ANNOUNCE_PALETTES[0];
  const imageUri = announcement?.imageUrl || announcement?.thumbnailUrl || null;
  useEffect(() => {
    setLoadedImageSize(
      announcement?.imageWidth && announcement?.imageHeight
        ? { width: announcement.imageWidth, height: announcement.imageHeight }
        : null,
    );
  }, [announcement?.id, announcement?.imageUrl, announcement?.thumbnailUrl, announcement?.imageWidth, announcement?.imageHeight]);
  const imagePreview = getAnnouncementDetailPreviewSize({
    windowWidth, windowHeight, topInset: top, bottomInset: bottom, headerHeight: 56,
  });
  // Banners here run ~3.2:1, which at full screen width leaves the preview
  // only ~14% of the screen tall. The frame is held at a squarer ratio so
  // the image reads larger, and cover trims the sides to fill it — a
  // deliberate trade of ~19% of the banner's width for the extra height.
  // Images taller than this ratio already fill the frame, so they keep
  // their own ratio and are not stretched.
  const imageAspectRatio = loadedImageSize?.width && loadedImageSize?.height
    ? loadedImageSize.width / loadedImageSize.height
    : null;
  const frameAspectRatio = imageAspectRatio == null
    ? DETAIL_FRAME_ASPECT_RATIO
    : Math.min(imageAspectRatio, DETAIL_FRAME_ASPECT_RATIO);
  // A frame at its natural ratio would overrun the screen for portrait
  // images, so those stay bounded by the capped pixel height instead.
  const frameHeight = windowWidth / frameAspectRatio;
  const previewFrameStyle = frameHeight <= imagePreview.height
    ? { width: "100%", aspectRatio: frameAspectRatio }
    : { width: "100%", height: imagePreview.height };
  const sourceUrl = getAnnouncementUrl(announcement);
  const normalizedUrl = normalizeOptionalUrl(sourceUrl);
  const dateValue = announcement?.published_at
    ?? announcement?.publishedAt
    ?? announcement?.created_at
    ?? announcement?.createdAt
    ?? announcement?.date;
  const dateText = formatDate(dateValue, i18n.language);

  const handleShare = async () => {
    try {
      const message = [title, body, normalizedUrl.ok ? normalizedUrl.url : null]
        .filter(Boolean)
        .join("\n\n");
      await Share.share({ message, title });
    } catch (_) {}
  };

  const handleOpenUrl = async () => {
    setLinkError(null);
    if (!normalizedUrl.ok || !normalizedUrl.url) {
      setLinkError(t("announce.invalidLink"));
      return;
    }

    try {
      if (!await Linking.canOpenURL(normalizedUrl.url)) {
        throw new Error("URL is not supported");
      }
      await Linking.openURL(normalizedUrl.url);
    } catch (_) {
      setLinkError(t("announce.linkOpenFailed"));
    }
  };

  const errorTitle = errorKind === "forbidden"
    ? t("announce.detailForbidden")
    : errorKind === "notFound"
      ? t("announce.detailNotFound")
      : t("announce.detailLoadFailed");
  const errorMessage = errorKind === "forbidden"
    ? t("announce.detailForbiddenSub")
    : errorKind === "notFound"
      ? t("announce.detailNotFoundSub")
      : t("announce.detailLoadFailedSub");
  const errorIcon = errorKind === "forbidden"
    ? "lock-closed-outline"
    : errorKind === "notFound"
      ? "document-text-outline"
      : "cloud-offline-outline";

  if (loading && !announcement) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
        <AppHeader title={t("announce.detailTitle")} onBack={() => navigation.goBack()} />
        <StateView type="loading" title={t("announce.loading")} />
      </View>
    );
  }

  if (errorKind || !announcement) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
        <AppHeader
          title={t("announce.detailTitle")}
          onBack={() => navigation.goBack()}
          rightIcon="refresh-outline"
          onRightPress={loadAnnouncement}
        />
        <View className="flex-1 justify-center">
          <StateView
            type="error"
            icon={errorIcon}
            title={errorTitle}
            message={errorMessage}
            actionLabel={t("announce.retry")}
            onAction={loadAnnouncement}
          />
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
            hitSlop={hitSlop}
            className="self-center px-4 py-2"
          >
            <Text style={{ ...typography.button, color: colors.textMuted, fontSize: 15 }}>
              {t("announce.back")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <AppHeader
        title={t("announce.detailTitle")}
        onBack={() => navigation.goBack()}
        rightIcon="refresh-outline"
        onRightPress={loadAnnouncement}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: Math.max(bottom, 24) + 16 }}
      >
        {!!refreshError && (
          <View style={[styles.warning, { marginHorizontal: 12 }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.brandYellowDark} />
            <Text style={styles.warningText}>{refreshError}</Text>
          </View>
        )}

        <View style={styles.content}>
          {imageUri ? (
            <TouchableOpacity
              onPress={() => setImageViewerVisible(true)}
              activeOpacity={0.92}
              accessibilityRole="button"
              accessibilityLabel={t("announce.openFullImage")}
              accessibilityHint={announcement.imageAlt || title}
              style={previewFrameStyle}
            >
              <AnnouncementImage
                uri={imageUri}
                fallbackUri={announcement.thumbnailUrl !== imageUri ? announcement.thumbnailUrl : null}
                alt={announcement.imageAlt}
                fallbackIcon={announcement.icon || palette.icon}
                fallbackLabel={tag}
                fallbackColor={colors.primary}
                fallbackBackground={colors.primaryMuted}
                resizeMode="cover"
                placeholderUri={announcement.thumbnailUrl}
                cacheKey={announcement.imageCacheKey}
                cachePolicy="default"
                onImageSize={({ width, height }) => setLoadedImageSize((current) => (
                  current?.width === width && current?.height === height ? current : { width, height }
                ))}
                style={{ width: "100%", height: "100%", backgroundColor: colors.primaryMuted }}
              />
              <View pointerEvents="none" style={styles.expandBadge}>
                <Ionicons name="expand-outline" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.noImageCover, { backgroundColor: colors.primaryMuted }]}>
              <View style={[styles.noImageIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name={announcement.icon ?? palette.icon} size={28} color={colors.primary} />
              </View>
              <Text style={styles.noImageLabel}>{tag}</Text>
            </View>
          )}

          <View style={styles.detailsBody}>
            <View style={styles.metaRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
              {!!dateText && (
                <View style={styles.dateRow}>
                  <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.dateText}>{dateText}</Text>
                </View>
              )}
            </View>

            <Text style={styles.title}>{title}</Text>
            <View style={styles.divider} />
            {body ? (
              <Text style={styles.body}>{body}</Text>
            ) : (
              <View style={styles.emptyBody}>
                <Ionicons name="newspaper-outline" size={30} color={colors.textSoft} />
                <Text style={styles.emptyBodyTitle}>{t("announce.detailEmpty")}</Text>
                <Text style={styles.emptyBodyText}>{t("announce.detailEmptySub")}</Text>
              </View>
            )}

            {!!linkError && <Text style={styles.linkError}>{linkError}</Text>}

            <View style={styles.actions}>
              {sourceUrl !== "" && (
                <TouchableOpacity
                  onPress={handleOpenUrl}
                  activeOpacity={0.85}
                  style={[styles.primaryAction, { flex: 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t("announce.readMore")}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={styles.primaryActionText}>{t("announce.readMore")}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleShare}
                activeOpacity={0.85}
                style={[styles.secondaryAction, sourceUrl === "" && { flex: 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t("announce.share")}
              >
                <Ionicons name="share-social-outline" size={19} color={colors.primary} />
                <Text style={styles.secondaryActionText}>{t("announce.share")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <AnnouncementImageViewer
        visible={imageViewerVisible}
        uri={imageUri}
        fallbackUri={announcement.thumbnailUrl !== imageUri ? announcement.thumbnailUrl : null}
        alt={announcement.imageAlt}
        imageWidth={loadedImageSize?.width ?? announcement.imageWidth}
        imageHeight={loadedImageSize?.height ?? announcement.imageHeight}
        cacheKey={announcement.imageCacheKey}
        onClose={() => setImageViewerVisible(false)}
      />
    </View>
  );
}

const styles = {
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brandYellowSoft,
    borderWidth: 1,
    borderColor: colors.borderWarning,
  },
  warningText: {
    flex: 1,
    color: colors.brandYellowDark,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  content: {
    padding: 0,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  detailsBody: {
    padding: 16,
    gap: 14,
  },
  expandBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  noImageCover: {
    width: "100%",
    height: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noImageIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  noImageLabel: {
    maxWidth: "65%",
    color: colors.primary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
  },
  tagText: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  title: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  body: {
    color: colors.secondaryText,
    fontSize: 16,
    lineHeight: 27,
    fontWeight: "400",
  },
  emptyBody: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
  },
  emptyBodyTitle: {
    color: colors.secondaryText,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyBodyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    textAlign: "center",
  },
  linkError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryAction: {
    minHeight: 48,
    paddingHorizontal: 15,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryActionText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
};
