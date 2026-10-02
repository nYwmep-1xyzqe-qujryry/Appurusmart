import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import StateView from "./StateView";
import { colors, hitSlop, radius } from "../theme/tokens";
import {
  getServiceLabel,
  getServiceRoute,
  isNativeServiceMisconfigured,
  isServiceUrlValid,
} from "../utils/services";

const ITEMS_PER_PAGE = 8;
const webOutline = Platform.OS === "web" ? { outlineStyle: "none" } : {};

const ServiceIcon = ({ service }) => {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [service.iconUrl]);

  if (service.iconUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: service.iconUrl }}
        onError={() => setImageFailed(true)}
        resizeMode="contain"
        style={{ width: 27, height: 27 }}
      />
    );
  }

  return <Ionicons name={service.iconName} size={24} color={service.iconColor} />;
};

const ServiceIconGrid = ({
  navigation,
  services,
  loading,
  refreshing,
  error,
  usingCache,
  apiEnabled,
  refresh,
}) => {
  const { t, i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef(null);
  const lastPressAt = useRef(0);

  const pages = useMemo(() => {
    const result = [];
    for (let i = 0; i < services.length; i += ITEMS_PER_PAGE) {
      const chunk = [...services.slice(i, i + ITEMS_PER_PAGE)];
      while (chunk.length < ITEMS_PER_PAGE) chunk.push({ spacer: true });
      result.push(chunk);
    }
    return result;
  }, [services]);

  useEffect(() => {
    const nextPage = Math.min(currentPage, Math.max(0, pages.length - 1));
    if (nextPage !== currentPage) setCurrentPage(nextPage);
    scrollRef.current?.scrollTo({ x: nextPage * containerWidth, animated: false });
  }, [containerWidth, pages.length, currentPage]);

  const handlePress = (service) => {
    const now = Date.now();
    if (now - lastPressAt.current < 500) return;
    lastPressAt.current = now;

    const route = getServiceRoute(service);
    if (route) {
      navigation?.navigate(route);
      return;
    }

    if (isNativeServiceMisconfigured(service)) {
      Alert.alert(t("home.serviceUnavailableTitle"), t("home.serviceUnavailable"));
      return;
    }

    if (service.actionType === "internal_route") {
      Alert.alert(t("home.serviceUnavailableTitle"), t("home.serviceUnavailable"));
      return;
    }

    if (isServiceUrlValid(service)) {
      navigation?.navigate("InAppBrowser", {
        url: service.url,
        title: getServiceLabel(service, i18n.language),
      });
      return;
    }

    Alert.alert(t("home.serviceUnavailableTitle"), t("home.serviceInvalidUrl"));
  };

  if (!apiEnabled) {
    return (
      <StateView
        type="empty"
        compact
        title={t("home.servicesApiDisabled")}
        message={t("home.servicesApiDisabledSub")}
      />
    );
  }

  if (loading && !services.length) {
    return <StateView type="loading" compact title={t("home.servicesLoading")} />;
  }

  if (!services.length) {
    const forbidden = error?.kind === "forbidden";
    const authBlocked = error?.kind === "auth";
    const setupRequired = error?.kind === "setup";
    const errorMessage = forbidden
      ? t("home.servicesForbiddenSub")
      : authBlocked ? t("home.servicesAuthRequiredSub")
        : setupRequired ? t("home.servicesSetupRequiredSub")
          : error ? t("home.servicesLoadFailedSub") : undefined;
    return (
      <StateView
        type={error ? "error" : "empty"}
        compact
        title={forbidden ? t("home.servicesForbidden")
          : authBlocked ? t("home.servicesAuthRequired")
            : setupRequired ? t("home.servicesSetupRequired")
              : error ? t("home.servicesLoadFailed") : t("home.servicesEmpty")}
        message={errorMessage}
        actionLabel={error && !forbidden && !authBlocked ? t("home.servicesRetry") : undefined}
        onAction={error && !forbidden && !authBlocked ? () => refresh({ force: true }) : undefined}
      />
    );
  }

  return (
    <View
      className="pt-[4px] px-[2px]"
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {error && (
        <TouchableOpacity
          onPress={() => refresh({ force: true })}
          activeOpacity={0.8}
          hitSlop={hitSlop}
          className="flex-row items-center justify-center mb-[8px]"
        >
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
          <Text className="text-[11px] font-semibold ml-[5px]" style={{ color: colors.warning }}>
            {error.kind === "setup"
              ? usingCache ? `${t("home.servicesSetupCached")} · ${t("home.servicesRetry")}` : `${t("home.servicesSetupRequiredSub")} · ${t("home.servicesRetry")}`
              : usingCache ? `${t("home.servicesCached")} · ${t("home.servicesRetry")}` : t("home.servicesRetry")}
          </Text>
        </TouchableOpacity>
      )}

      {containerWidth > 0 && (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
              setCurrentPage(page);
            }}
          >
            {pages.map((page, pageIndex) => {
              const rows = [];
              for (let i = 0; i < page.length; i += 4) rows.push(page.slice(i, i + 4));
              return (
                <View key={pageIndex} style={{ width: containerWidth }}>
                  {rows.map((row, rowIndex) => (
                    <View
                      key={rowIndex}
                      className="flex-row"
                      style={rowIndex < rows.length - 1 ? { marginBottom: 16 } : {}}
                    >
                      {row.map((service, colIndex) => service.spacer ? (
                        <View key={colIndex} className="flex-1" />
                      ) : (
                        <TouchableOpacity
                          key={service.serviceKey}
                          className="flex-1 items-center"
                          style={[{ minHeight: 86 }, webOutline]}
                          onPress={() => handlePress(service)}
                          activeOpacity={0.78}
                          hitSlop={hitSlop}
                          accessibilityRole="button"
                          accessibilityLabel={getServiceLabel(service, i18n.language)}
                        >
                          <View
                            className="w-[56px] h-[56px] items-center justify-center mb-[7px]"
                            style={[{
                              backgroundColor: service.backgroundColor,
                              borderRadius: radius.md,
                              borderWidth: 1,
                              borderColor: "rgba(15,122,85,0.08)",
                            }, webOutline]}
                          >
                            <ServiceIcon service={service} />
                          </View>
                          <Text
                            className="text-[12px] text-center leading-[16px]"
                            style={{ color: colors.text, fontWeight: "700" }}
                            numberOfLines={2}
                          >
                            {getServiceLabel(service, i18n.language)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          {pages.length > 1 && (
            <View className="flex-row justify-center items-center mt-[14px] gap-[6px]">
              {pages.map((_, i) => (
                <View
                  key={i}
                  className="h-[6px] rounded-[3px]"
                  style={{
                    width: i === currentPage ? 18 : 6,
                    backgroundColor: i === currentPage ? colors.primary : colors.border,
                  }}
                />
              ))}
            </View>
          )}
        </>
      )}
      {refreshing && <Text className="text-[10px] text-center mt-[5px]" style={{ color: colors.textMuted }}>{t("home.servicesRefreshing")}</Text>}
    </View>
  );
};

export default ServiceIconGrid;
