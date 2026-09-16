import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/tokens";

export default function AnnouncementImage({
  uri,
  alt,
  style,
  resizeMode = "cover",
  fallbackIcon = "newspaper-outline",
  fallbackColor = colors.primary,
  fallbackBackground = colors.primaryMuted,
  showFallback = true,
  cacheKey = null,
  cachePolicy = "reload",
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(uri));

  useEffect(() => {
    setFailed(false);
    setLoading(Boolean(uri));
  }, [uri, cacheKey]);

  if (!uri || failed) {
    if (!showFallback) return null;
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt || "ภาพข่าวสาร"}
        style={[{ alignItems: "center", justifyContent: "center", backgroundColor: fallbackBackground }, style]}
      >
        <Ionicons name={fallbackIcon} size={28} color={fallbackColor} />
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
      <Image
        key={`${uri}:${cacheKey ?? ""}`}
        accessible={false}
        source={{ uri, cache: cachePolicy }}
        resizeMode={resizeMode}
        style={StyleSheet.absoluteFillObject}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
      />
      {loading && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center", backgroundColor: fallbackBackground }]}>
          <ActivityIndicator size="small" color={fallbackColor} />
        </View>
      )}
    </View>
  );
}
