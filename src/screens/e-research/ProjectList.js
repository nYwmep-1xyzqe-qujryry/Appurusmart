import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import useLrdResource from "../../hook/useLrdResource";
import useConfirm from "../../hook/useConfirm";
import { LRD_ENDPOINTS, LRD_VISIBLE_SCOPE } from "../../services/lrdApi";
import useLrdSession from "../../hook/useLrdSession";
import { sanitizeAcademicText } from "../../utils/inputSanitize";
import { useEResearchText } from "./i18n";
import {
  getResearchLockedReason,
  getResearchTitleTh,
  getResearchYear,
  isResearchEditable,
  isResearchMemberRole,
} from "./researchFields";

export default function ProjectList({ navigation, route }) {
  const { te } = useEResearchText();
  // The registered route is authoritative so a stale/missing navigation
  // param cannot make the search screen request the owner's list.
  const searchMode = route?.params?.mode === "search" || route?.name === "ProjectSearch";
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const scrollRef = useRef(null);
  const perPage = 20;
  const { researcherId, loading: sessionLoading } = useLrdSession();
  const { items, total, loading, error, cacheInfo, remove, refetch } = useLrdResource(LRD_ENDPOINTS.researches, {
    // โหมดจัดการเป็นของฉัน ส่วนโหมดสืบค้นเป็นข้อมูลที่บัญชีนี้มีสิทธิ์เห็น
    params: { scope: searchMode ? LRD_VISIBLE_SCOPE : "mine", page, per_page: perPage, ...(query ? { q: query } : {}) },
    skip: sessionLoading,
    forceRefreshOnFocus: true,
    diagnosticOwnerId: researcherId,
  });
  const { confirm, ConfirmDialog } = useConfirm();
  const hasStaleCache = cacheInfo.source === "cache" && cacheInfo.stale;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  useEffect(() => {
    if (cacheInfo.source === "api" && !loading && !error && page > totalPages) setPage(totalPages);
  }, [cacheInfo.source, loading, error, page, totalPages]);

  const changePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const submitSearch = () => {
    setPage(1);
    setQuery(searchText.trim());
  };

  const isOwnedByCurrentUser = (item) =>
    researcherId && String(item.researcher_id) === String(researcherId);

  const handleDelete = (item) => {
    confirm({
      title: te("common.deleteTitle"),
      message: te("project.deleteConfirm"),
      icon: "trash-outline",
      onConfirm: async () => {
        try {
          await remove(item.id);
        } catch (error) {
          Alert.alert(te("common.deleteFailed"), error.message ?? te("common.tryAgain"));
        }
      },
    });
  };

  return (
    <View className="flex-1 bg-[#f0f4f2]">
      <AppHeader title={te(searchMode ? "project.searchTitle" : "project.title")} onBack={() => navigation.goBack()} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-2xl p-3 mb-4 flex-row items-center" style={{ elevation: 1 }}>
          <Ionicons name="search-outline" size={19} color="#5F7069" />
          <TextInput
            className="flex-1 min-h-[44px] text-[16px] leading-6 text-[#17352a] px-3"
            value={searchText}
            onChangeText={(text) => setSearchText(sanitizeAcademicText(text))}
            onSubmitEditing={submitSearch}
            placeholder={te("project.searchPlaceholder")}
            placeholderTextColor="#5F7069"
            returnKeyType="search"
            accessibilityLabel={te("project.searchPlaceholder")}
          />
          <TouchableOpacity className="min-h-[44px] px-4 rounded-xl bg-[#07865F] items-center justify-center" onPress={submitSearch} accessibilityRole="button">
            <Text className="text-white text-[14px] font-bold">{te("common.search")}</Text>
          </TouchableOpacity>
        </View>
        {hasStaleCache && (
          <View className="bg-[#FFF8E6] border border-[#E8D18A] rounded-xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="cloud-offline-outline" size={20} color="#8A6412" />
            <View className="flex-1 ml-2 pr-2">
              <Text className="text-[14px] font-bold text-[#6F5312]">{te("common.cachedData")}</Text>
              <Text className="text-[13px] text-[#6F5312] mt-1">{te("common.cachedRefreshFailed")}</Text>
            </View>
            <TouchableOpacity
              className="min-h-[40px] px-3 rounded-lg bg-[#07865F] flex-row items-center justify-center"
              onPress={() => refetch({ force: true })}
              accessibilityRole="button"
              accessibilityLabel={te("common.retry")}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text className="text-white text-[13px] font-bold ml-1">{te("common.retry")}</Text>
            </TouchableOpacity>
          </View>
        )}
        {searchMode && !loading && !error && !hasStaleCache && (
          <View className="bg-[#FFF8E6] rounded-xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="library-outline" size={19} color="#8A6412" />
            <Text className="text-[14px] font-bold text-[#6F5312] ml-2">
              {te("project.searchTotal", { total })}
            </Text>
          </View>
        )}
        <View className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4" style={{ elevation: 1 }}>
          <View className="flex-row items-center bg-[#07865F] px-[14px] py-[11px]">
            <Text className="text-white text-[14px] font-extrabold flex-1">{te("common.order")}</Text>
            <Text className="text-white text-[14px] font-extrabold flex-[3]">{te("project.tableTitle")}</Text>
            <Text className="text-white text-[14px] font-extrabold flex-1 text-center">{te("common.document")}</Text>
            <Text className="text-white text-[14px] font-extrabold flex-1 text-center">{te("common.actions")}</Text>
          </View>

          {loading || sessionLoading ? (
            <View className="flex-row items-center justify-center py-9 gap-[10px]">
              <ActivityIndicator size="small" color="#07865F" />
              <Text className="text-[14px] text-[#5F7069]">{te("common.loading")}</Text>
            </View>
          ) : error && !hasStaleCache ? (
            <View className="items-center py-9 px-5">
              <Ionicons name="cloud-offline-outline" size={42} color="#c45b5b" />
              <Text className="text-[15px] font-bold text-[#8b2f2f] mt-[10px] text-center">{te("project.loadFailed")}</Text>
              <Text className="text-[13px] text-[#5F7069] mt-1 text-center">{te("common.requestFailed")}</Text>
              <TouchableOpacity className="bg-[#07865F] rounded-lg px-4 py-2 mt-3" onPress={() => refetch({ force: true })}>
                <Text className="text-white text-[13px] font-bold">{te("common.retry")}</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View className="items-center py-9">
              <Ionicons name="folder-open-outline" size={42} color="#5F7069" />
              <Text className="text-[15px] font-bold text-[#1f2a2e] mt-[10px]">{te("project.emptyTitle")}</Text>
              <Text className="text-[13px] text-[#5F7069] mt-1">{te("project.emptyHint")}</Text>
            </View>
          ) : (
            items.map((item, index) => {
              const owned = isOwnedByCurrentUser(item);
              // A record bound to an LRD proposal, or one this researcher only
              // contributes to, is read-only even in the management list.
              const canManage = !searchMode && owned && isResearchEditable(item, owned);
              const lockedReason = !searchMode && owned && !canManage
                ? getResearchLockedReason(item)
                : "";
              return (
              <View key={item.id} className="flex-row items-center px-[14px] py-3 border-t border-[#eef1f4]">
                <Text className="text-[14px] font-bold text-[#1f2a2e] flex-1">{(page - 1) * perPage + index + 1}</Text>
                <TouchableOpacity
                  className="flex-[3] pr-2 min-h-[44px] justify-center"
                  onPress={() => navigation.navigate("ResearchDocumentDetail", { type: "project", item, searchMode })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${te("common.viewDetails")} ${getResearchTitleTh(item)}`}
                >
                  <Text className="text-[14px] font-semibold text-[#1f2a2e]" numberOfLines={2}>{getResearchTitleTh(item) || "-"}</Text>
                  {isResearchMemberRole(item) ? (
                    <View className="self-start rounded-full bg-[#eef1f0] px-2 py-[2px] mt-[3px]">
                      <Text className="text-[11px] font-bold text-[#5d6b65]">{te("project.roleMember")}</Text>
                    </View>
                  ) : null}
                  <Text className="text-[12px] text-[#5F7069] mt-[2px]">
                    {te("project.yearLine", { year: getResearchYear(item) || "-" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 min-h-[44px] items-center justify-center"
                  onPress={() => navigation.navigate("ResearchDocumentDetail", { type: "project", item, searchMode })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={te("common.viewDetails")}
                >
                  <Ionicons name="eye-outline" size={19} color="#07865F" />
                </TouchableOpacity>
                <View className="flex-1 flex-row gap-[6px] justify-center">
                  {canManage ? (
                    <>
                  <TouchableOpacity
                    className="w-[32px] h-[32px] rounded-lg bg-[#fff4e0] items-center justify-center"
                    onPress={() => navigation.navigate("ProjectForm", { item })}
                  >
                    <Ionicons name="create-outline" size={16} color="#a8631a" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="w-[32px] h-[32px] rounded-lg bg-[#fde7e7] items-center justify-center"
                    onPress={() => handleDelete(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#df4c4b" />
                  </TouchableOpacity>
                    </>
                  ) : lockedReason ? (
                    // The record is the researcher's own but the backend locked
                    // it; showing why beats a bare padlock the user cannot act on.
                    <TouchableOpacity
                      className="min-h-[44px] items-center justify-center px-1"
                      onPress={() => Alert.alert(te("project.lockedTitle"), lockedReason)}
                      accessibilityRole="button"
                      accessibilityLabel={lockedReason}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="lock-closed-outline" size={17} color="#a8631a" />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="lock-closed-outline" size={17} color="#5F7069" />
                  )}
                </View>
              </View>
              );
            })
          )}
        </View>

        {totalPages > 1 && !hasStaleCache && (
          <View className="bg-white rounded-2xl p-3 mb-4 flex-row items-center" style={{ elevation: 1 }}>
            <TouchableOpacity
              className="min-h-[44px] flex-1 rounded-xl flex-row items-center justify-center bg-[#edf5f1]"
              onPress={() => changePage(page - 1)}
              disabled={page === 1 || loading}
              activeOpacity={0.75}
              style={{ opacity: page === 1 || loading ? 0.45 : 1 }}
              accessibilityRole="button"
              accessibilityLabel={te("common.previous")}
              accessibilityState={{ disabled: page === 1 || loading }}
            >
              <Ionicons name="chevron-back" size={17} color="#07865F" />
              <Text className="text-[14px] font-bold text-[#07865F] ml-1">{te("common.previous")}</Text>
            </TouchableOpacity>

            <View className="px-4 items-center">
              <Text className="text-[14px] font-black text-[#17352a]" style={{ fontVariant: ["tabular-nums"] }}>
                {te("common.pageInfo", { page, totalPages })}
              </Text>
              <Text className="text-[12px] text-[#5F7069] mt-1" style={{ fontVariant: ["tabular-nums"] }}>
                {te("common.totalItems", { total })}
              </Text>
            </View>

            <TouchableOpacity
              className="min-h-[44px] flex-1 rounded-xl flex-row items-center justify-center bg-[#07865F]"
              onPress={() => changePage(page + 1)}
              disabled={page === totalPages || loading}
              activeOpacity={0.75}
              style={{ opacity: page === totalPages || loading ? 0.45 : 1 }}
              accessibilityRole="button"
              accessibilityLabel={te("common.next")}
              accessibilityState={{ disabled: page === totalPages || loading }}
            >
              <Text className="text-[14px] font-bold text-white mr-1">{te("common.next")}</Text>
              <Ionicons name="chevron-forward" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {!searchMode && (
          <TouchableOpacity
            className="flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-[13px]"
            style={{ elevation: 2 }}
            onPress={() => navigation.navigate("ProjectForm")}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={19} color="#fff" />
            <Text className="text-white text-[15px] font-black">{te("common.add")}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <ConfirmDialog />
    </View>
  );
}
