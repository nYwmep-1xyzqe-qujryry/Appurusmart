import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isExternalWebUrl } from "../../utils/url";
import { colors } from "../../theme/tokens";

// External services authenticate themselves; never expose the Mobile API token.
export default function InAppBrowser({ route, navigation }) {
  const { url, title } = route.params ?? {};
  const [loading, setLoading] = useState(isExternalWebUrl(url));
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef(null);
  const insets = useSafeAreaInsets();
  const pt = insets.top || (Platform.OS === "ios" ? 50 : (StatusBar.currentHeight ?? 0) + 8);

  return (
    <View className="flex-1 bg-primary">
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View className="flex-row items-center bg-primary px-2 pb-3" style={{ paddingTop: pt }}>
        <TouchableOpacity className="w-9 h-9 items-center justify-center"
          onPress={() => canGoBack ? webViewRef.current?.goBack() : navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text className="flex-1 text-white text-[17px] font-bold text-center mx-1" numberOfLines={1}>{title}</Text>
        <TouchableOpacity className="w-9 h-9 items-center justify-center" onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      {isExternalWebUrl(url) ? (
        <WebView ref={webViewRef} source={{ uri: url }} className="flex-1 bg-white"
          incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
          onShouldStartLoadWithRequest={(request) => isExternalWebUrl(request.url) || request.url === "about:blank"}
          onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)}
          onError={() => setLoading(false)}
          onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
          javaScriptEnabled domStorageEnabled allowsBackForwardNavigationGestures />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="warning-outline" size={48} color={colors.danger} />
          <Text className="text-[17px] font-bold mt-3" style={{ color: colors.text }}>URL ไม่ปลอดภัย</Text>
          <Text className="text-[14px] mt-1" style={{ color: colors.secondaryText }}>รองรับเฉพาะ http และ https เท่านั้น</Text>
        </View>
      )}
      {loading && <View className="absolute items-center justify-center" style={{ top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.85)" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>}
    </View>
  );
}
