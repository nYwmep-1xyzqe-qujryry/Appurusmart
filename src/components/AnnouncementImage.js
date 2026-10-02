import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/tokens";
import {
  getSuccessfulAnnouncementSource,
  rememberAnnouncementSource,
} from "../utils/announcementImageCache";
import {
  isCurrentImageCallback,
  shouldShowCachedPlaceholder,
} from "../utils/announcementImageState";

export default function AnnouncementImage(props) {
  return (
    <AnnouncementImageContent
      key={JSON.stringify([props.uri, props.fallbackUri, props.placeholderUri, props.cacheKey])}
      {...props}
    />
  );
}

function AnnouncementImageContent({
  uri,
  alt,
  style,
  fallbackUri = null,
  resizeMode = "cover",
  fallbackIcon = "newspaper-outline",
  fallbackLabel = "ข่าวสาร",
  fallbackColor = colors.primary,
  fallbackBackground = colors.primaryMuted,
  fallbackVariant = "cover",
  showFallback = true,
  cacheKey = null,
  cachePolicy = "default",
  placeholderUri = null,
  onImageSize,
  onImageLoadStart,
  onImageLoad,
  onImageError,
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(uri || fallbackUri));
  const [currentUri, setCurrentUri] = useState(() => getSuccessfulAnnouncementSource(uri, fallbackUri, cacheKey));
  const loadStartedAt = useRef(null);
  const attemptedUris = useRef(new Set());
  const currentUriRef = useRef(currentUri);
  const requestIdRef = useRef(0);
  const callbacksRef = useRef({ onImageSize, onImageLoadStart, onImageLoad, onImageError });
  callbacksRef.current = { onImageSize, onImageLoadStart, onImageLoad, onImageError };
  // A placeholder must never cost a second download. The `cache` source option
  // maps to NSURLRequest's cache policy and is honoured on iOS only — Android's
  // Fresco ignores it and would fetch the file — so the placeholder is iOS-only
  // and uses `only-if-cached`, which fails instead of hitting the network when
  // the entry has been evicted. The failure is caught below and the placeholder
  // is simply dropped.
  const [placeholderMissed, setPlaceholderMissed] = useState(false);
  const showPlaceholder = shouldShowCachedPlaceholder({
    placeholderUri,
    currentUri,
    platformOS: Platform.OS,
    placeholderMissed,
  });

  if (!currentUri || failed) {
    if (!showFallback) return null;
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt || fallbackLabel}
        style={[
          fallbackVariant === "home" ? styles.homeFallback : styles.fallback,
          { backgroundColor: fallbackBackground },
          style,
        ]}
      >
        <View style={fallbackVariant === "compact"
          ? [styles.compactFallbackIcon, { borderColor: `${fallbackColor}30` }]
          : fallbackVariant === "home"
            ? styles.homeFallbackIcon
            : [styles.fallbackIcon, { borderColor: `${fallbackColor}30` }]}
        >
          <Ionicons
            name={fallbackIcon}
            size={fallbackVariant === "compact" ? 25 : fallbackVariant === "home" ? 26 : 30}
            color={fallbackColor}
          />
        </View>
        {fallbackVariant !== "compact" && (
          <>
            <Text
              numberOfLines={1}
              style={[
                fallbackVariant === "home" ? styles.homeFallbackLabel : styles.fallbackLabel,
                { color: fallbackColor },
              ]}
            >
              {fallbackLabel}
            </Text>
            {fallbackVariant !== "home" && <Text style={styles.fallbackBrand}>URU SMART</Text>}
          </>
        )}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={alt || "ภาพข่าวสาร"}
      style={[{ overflow: "hidden", backgroundColor: fallbackBackground }, style]}
    >
      {/* A already-cached smaller source shown underneath so the frame is
          never blank while the larger one downloads. */}
      {loading && showPlaceholder && (
        <Image
          accessible={false}
          onError={() => setPlaceholderMissed(true)}
          source={{ uri: placeholderUri, cache: "only-if-cached" }}
          resizeMode={resizeMode}
          fadeDuration={0}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Image
        accessible={false}
        source={{ uri: currentUri, cache: cachePolicy }}
        resizeMode={resizeMode}
        fadeDuration={0}
        style={{ width: "100%", height: "100%" }}
        onLoadStart={() => {
          const requestId = requestIdRef.current + 1;
          requestIdRef.current = requestId;
          loadStartedAt.current = Date.now();
          setLoading(true);
          setFailed(false);
          callbacksRef.current.onImageLoadStart?.({
            uri: currentUri,
            startedAt: loadStartedAt.current,
            requestId,
          });
          if (__DEV__) {
            console.log("[AnnouncementImage] load start", { requestId });
          }
        }}
        onLoad={(event) => {
          if (!isCurrentImageCallback(currentUriRef.current, currentUri)) return;
          rememberAnnouncementSource(uri, fallbackUri, cacheKey, currentUri);
          setLoading(false);
          const { width, height } = event.nativeEvent?.source ?? {};
          const elapsedMs = loadStartedAt.current == null
            ? null
            : Math.max(0, Date.now() - loadStartedAt.current);
          if (width > 0 && height > 0) callbacksRef.current.onImageSize?.({ width, height, uri: currentUri });
          callbacksRef.current.onImageLoad?.({ width, height, uri: currentUri, elapsedMs });
          if (__DEV__) {
            console.log("[AnnouncementImage] loaded", { width, height, elapsedMs });
          }
        }}
        onError={() => {
          if (!isCurrentImageCallback(currentUriRef.current, currentUri)) return;
          if (__DEV__) {
            console.warn("[AnnouncementImage] load error");
          }
          attemptedUris.current.add(currentUri);
          const nextUri = [uri, fallbackUri].find((candidate) => candidate && !attemptedUris.current.has(candidate));
          if (nextUri) {
            currentUriRef.current = nextUri;
            setCurrentUri(nextUri);
            setLoading(true);
            return;
          }
          setLoading(false);
          setFailed(true);
          callbacksRef.current.onImageError?.({ uri: currentUri, fallbackUri });
        }}
      />
      {loading && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="small" color={fallbackColor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    padding: 4,
  },
  homeFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  homeFallbackIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  fallbackIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
  },
  compactFallbackIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
  },
  fallbackLabel: {
    maxWidth: "88%",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  homeFallbackLabel: {
    maxWidth: "88%",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  fallbackBrand: {
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },
});
