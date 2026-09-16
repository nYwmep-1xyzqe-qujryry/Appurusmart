import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radius, shadows, typography } from "../theme/tokens";
import HeaderBar from "../components/HeaderBar";
import AiProviderLogo, { normalizeProvider } from "../components/AiProviderLogo";
import useCurrentUser from "../hook/useCurrentUser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createChatConversation,
  deleteChatConversationRemote,
  fetchChatConversationMessages,
  fetchChatConversations,
  fetchChatHistory,
  fetchChatModels,
  sendChatMessage,
  updateChatConversationRemote,
} from "../services/chatbot";
import {
  clearChatHistory,
  createChatMessage,
  loadActiveChat,
  loadChatConversations,
  loadChatMessages,
  saveChatHistory,
  setActiveChat,
  updateChatConversation,
} from "../services/chatHistoryService";

// ── Typing indicator (3 dots) ──────────────────────────────
const TypingDot = ({ delay }) => {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);
  return (
    <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, opacity: anim, marginHorizontal: 2 }} />
  );
};

const TypingBubble = () => (
  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
    <LinearGradient colors={[colors.primaryDark, colors.primary]} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="sparkles" size={15} color="rgba(255,255,255,0.95)" />
    </LinearGradient>
    <View style={{ backgroundColor: "#fff", borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: "#e8ede9", flexDirection: "row", alignItems: "center" }}>
      <TypingDot delay={0} />
      <TypingDot delay={200} />
      <TypingDot delay={400} />
    </View>
  </View>
);

// ── Chat bubble ────────────────────────────────────────────
const ChatBubble = ({ item, onRetry, onEdit }) => {
  const { t } = useTranslation();
  const isUser = item.role === "user";
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const bubbleRef = useRef(null);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const MENU_W = Math.min(218, SCREEN_W - 32);

  const formatBubbleTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("th-TH", {
      day: "2-digit", month: "short", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(item.text ?? "");
    setMenuVisible(false);
  };

  const handleEdit = () => {
    setMenuVisible(false);
    onEdit?.(item.id, item.text ?? "");
  };

  const menuHeight = isUser ? 158 : 102;

  const openMenu = () => {
    bubbleRef.current?.measureInWindow((x, y, w, h) => {
      let top = y + h + 8;
      if (top + menuHeight > SCREEN_H - 24) top = y - menuHeight - 8;
      top = Math.max(24, top);
      let left = isUser ? x + w - MENU_W : x;
      left = Math.max(12, Math.min(left, SCREEN_W - MENU_W - 12));
      setMenuPos({ top, left });
      setMenuVisible(true);
    });
  };

  if (item.error) {
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceDanger, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
        </View>
        <View style={{ maxWidth: "78%", backgroundColor: colors.surfaceDanger, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.borderDanger }}>
          <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 22, fontWeight: "600", letterSpacing: 0 }}>{t("chatbot.connectError")}</Text>
          <TouchableOpacity onPress={() => onRetry(item.retryText)} activeOpacity={0.75} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="refresh" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "600", letterSpacing: 0 }}>{t("chatbot.retry")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: "100%" }}>
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          justifyContent: isUser ? "flex-end" : "flex-start",
        }}
      >
        {!isUser && (
          <LinearGradient colors={[colors.primaryDark, colors.primary]} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="sparkles" size={15} color="rgba(255,255,255,0.95)" />
          </LinearGradient>
        )}
        {isUser ? (
          <Pressable
            ref={bubbleRef}
            onLongPress={openMenu}
            delayLongPress={350}
            style={{ maxWidth: "66%", minWidth: 88, flexShrink: 1, alignSelf: "flex-end" }}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryLight]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 22, borderBottomRightRadius: 7, paddingHorizontal: 16, paddingVertical: 12 }}
            >
              <Text style={{ ...typography.body, color: colors.surface }}>{item.text}</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable ref={bubbleRef} onLongPress={openMenu} delayLongPress={350} style={{ maxWidth: "78%", backgroundColor: colors.surface, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, ...shadows.card }}>
          <Text style={{ ...typography.body, color: colors.text, fontSize: 15, lineHeight: 23 }}>{item.text}</Text>
          </Pressable>
        )}
      </View>

      {/* Inline action row under stopped user bubble */}
      {item.stopped && isUser && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 5, gap: 6 }}>
          <TouchableOpacity onPress={handleEdit} activeOpacity={0.75}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 }}>
            <Ionicons name="pencil-outline" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "600", letterSpacing: 0 }}>แก้ไข</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.75}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 }}>
            <Ionicons name="copy-outline" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: "600", letterSpacing: 0 }}>คัดลอก</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Long press popup */}
      <Modal visible={menuVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuVisible(false)}>
        <View style={{ flex: 1 }}>
          <Pressable
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(38, 54, 50, 0.30)" }}
            onPress={() => setMenuVisible(false)}
          />
          <View
            style={{
            position: "absolute",
            top: menuPos.top,
            left: menuPos.left,
            width: MENU_W,
            borderRadius: radius.xl,
            overflow: "hidden",
            backgroundColor: colors.surfaceMuted,
            ...shadows.floating,
          }}
          >
            <View style={{ height: 46, justifyContent: "center", paddingHorizontal: 18 }}>
              <Text style={{ ...typography.caption, color: colors.textSoft }} numberOfLines={1}>
                {formatBubbleTime(item.createdAt) || "ข้อความ"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleCopy}
              activeOpacity={0.68}
              style={{
                height: 56,
                justifyContent: "center",
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18 }}>
                <Ionicons name="copy-outline" size={25} color={colors.text} />
                <Text style={{ ...typography.body, marginLeft: 18 }}>คัดลอก</Text>
              </View>
            </TouchableOpacity>

            {isUser && (
              <TouchableOpacity
                onPress={handleEdit}
                activeOpacity={0.68}
                style={{ height: 56, justifyContent: "center", backgroundColor: colors.surfaceMuted }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18 }}>
                  <Ionicons name="pencil-outline" size={25} color={colors.text} />
                  <Text style={{ ...typography.body, marginLeft: 18 }}>แก้ไข</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const formatChatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
};

const getFirstTextValue = (source, keys) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const extractRemoteHistoryItems = (payload) => {
  const root = payload?.data ?? payload;
  const candidates = [
    root?.data?.data,
    root?.data,
    root?.history?.data,
    root?.history,
    root?.messages?.data,
    root?.messages,
    root,
  ];
  return candidates.find(Array.isArray) ?? [];
};

const normalizeRemoteHistoryItem = (item) => {
  if (!item || typeof item !== "object") return [];

  if (Array.isArray(item.messages)) {
    return item.messages.flatMap(normalizeRemoteHistoryItem);
  }

  const createdAt =
    item.created_at ??
    item.createdAt ??
    item.updated_at ??
    item.updatedAt ??
    new Date().toISOString();

  if (item.role) {
    const text = getFirstTextValue(item, ["text", "content", "message", "reply", "answer"]);
    if (!text) return [];
    const role = item.role === "assistant" || item.role === "bot" ? "bot" : "user";
    return [createChatMessage(role, text, { createdAt })];
  }

  const userText = getFirstTextValue(item, [
    "question",
    "user_message",
    "prompt",
    "input",
    "message",
  ]);
  const botText = getFirstTextValue(item, [
    "answer",
    "bot_reply",
    "assistant_message",
    "response",
    "reply",
    "output",
  ]);

  return [
    userText ? createChatMessage("user", userText, { createdAt }) : null,
    botText ? createChatMessage("bot", botText, { createdAt }) : null,
  ].filter(Boolean);
};

const normalizeRemoteChatHistory = (payload) =>
  extractRemoteHistoryItems(payload).flatMap(normalizeRemoteHistoryItem);

const extractRemoteList = (payload, keys = []) => {
  const root = payload?.data ?? payload;
  const keyedCandidates = keys.flatMap((key) => [
    root?.[key]?.data,
    root?.[key],
    root?.data?.[key]?.data,
    root?.data?.[key],
  ]);
  const candidates = [
    ...keyedCandidates,
    root?.data?.data,
    root?.data,
    root,
  ];
  return candidates.find(Array.isArray) ?? [];
};

const normalizeRemoteConversation = (item) => {
  if (!item || typeof item !== "object" || item.id == null) return null;
  const title = getFirstTextValue(item, ["title", "name", "conversation_title"]) || "แชทใหม่";
  const preview = getFirstTextValue(item, [
    "preview",
    "last_message",
    "lastMessage",
    "latest_message",
    "latestMessage",
  ]);
  const updatedAt =
    item.updated_at ??
    item.updatedAt ??
    item.last_message_at ??
    item.lastMessageAt ??
    item.created_at ??
    item.createdAt ??
    new Date().toISOString();

  return {
    id: String(item.id),
    title,
    preview,
    messageCount: Number(item.message_count ?? item.messageCount ?? item.messages_count ?? 0),
    pinned: Boolean(item.pinned ?? item.is_pinned ?? item.isPinned),
    customTitle: Boolean(item.custom_title ?? item.customTitle ?? item.title),
    createdAt: item.created_at ?? item.createdAt ?? updatedAt,
    updatedAt,
  };
};

const normalizeRemoteConversations = (payload) =>
  extractRemoteList(payload, ["conversations"])
    .map(normalizeRemoteConversation)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

const normalizeRemoteMessage = (item) => {
  if (!item || typeof item !== "object") return null;
  const roleValue = String(item.role ?? item.sender ?? item.type ?? "").toLowerCase();
  const role =
    roleValue === "assistant" || roleValue === "bot" || roleValue === "ai"
      ? "bot"
      : "user";
  const text = getFirstTextValue(item, [
    "text",
    "content",
    "message",
    "reply",
    "answer",
  ]);
  if (!text) return null;
  return createChatMessage(role, text, {
    id: item.id != null ? String(item.id) : undefined,
    createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
  });
};

const normalizeRemoteMessages = (payload) =>
  extractRemoteList(payload, ["messages"])
    .flatMap((item) => {
      const normalized = normalizeRemoteMessage(item);
      return normalized ? [normalized] : normalizeRemoteHistoryItem(item);
    })
    .filter(Boolean);

const extractRemoteConversationId = (payload) => {
  const root = payload?.data ?? payload ?? {};
  return (
    root.id ??
    root.conversation_id ??
    root.conversationId ??
    root.conversation?.id ??
    root.data?.id ??
    root.data?.conversation_id ??
    root.data?.conversationId ??
    root.data?.conversation?.id ??
    null
  );
};

const extractRemoteReply = (payload) => {
  const root = payload?.data ?? payload ?? {};
  return (
    getFirstTextValue(root, ["reply", "answer", "message", "response"]) ||
    getFirstTextValue(root.data, ["reply", "answer", "message", "response"]) ||
    "—"
  );
};

const HistoryRow = ({ item, active, onPress, onMenu }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: active ? "#e6f5ef" : "#fff",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: active ? "#b7dece" : "#edf2ef",
    }}
  >
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onMenu}
      activeOpacity={0.78}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minWidth: 0,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? "#07865F" : "#f1f7f4",
        }}
      >
        <Ionicons
          name={active ? "chatbubble" : "chatbubble-outline"}
          size={18}
          color={active ? "#fff" : "#07865F"}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: "#102019", fontSize: 16, fontWeight: "800" }}
        >
          {item.title}
        </Text>
        {!!item.preview && (
          <Text
            numberOfLines={1}
            style={{ color: "#5F7069", fontSize: 13, fontWeight: "600", marginTop: 4 }}
          >
            {item.preview}
          </Text>
        )}
      </View>
      <Text style={{ color: "#8fa198", fontSize: 12, fontWeight: "700" }}>
        {formatChatTime(item.updatedAt)}
      </Text>
    </TouchableOpacity>
    {item.pinned && (
      <Ionicons name="pin" size={15} color="#07865F" />
    )}
    <TouchableOpacity
      onPress={(event) => {
        event?.stopPropagation?.();
        onMenu(event);
      }}
      activeOpacity={0.75}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5faf7",
        borderWidth: 1,
        borderColor: "#dce8e2",
      }}
    >
      <Ionicons name="ellipsis-horizontal" size={18} color="#5F7069" />
    </TouchableOpacity>
  </View>
);

const FALLBACK_MODELS = [
  { provider: "Claude",     id: "claude-sonnet-5",        display_name: "Claude Sonnet 5" },
  { provider: "Claude",     id: "claude-sonnet-4.6",      display_name: "Claude Sonnet 4.6" },
  { provider: "Deepseek",   id: "deepseek-v4-pro",        display_name: "DeepSeek V4 Pro" },
  { provider: "Deepseek",   id: "deepseek-v4-flash",      display_name: "DeepSeek V4 Flash" },
  { provider: "Gemini",     id: "gemini-3.7-flash",       display_name: "Gemini 3.7 Flash" },
  { provider: "Gemini",     id: "gemini-2.5-flash-lite",  display_name: "Gemini 2.5 Flash Lite" },
  { provider: "Meta AI",    id: "llama-4-maverick",       display_name: "Llama 4 Maverick" },
  { provider: "Meta AI",    id: "llama-4-scout",          display_name: "Llama 4 Scout" },
  { provider: "Mistral",    id: "mistral-medium-3",       display_name: "Mistral Medium 3" },
  { provider: "Nova (AWS)", id: "nova-2-lite-v1",         display_name: "Nova 2 Lite" },
  { provider: "OpenAI",     id: "gpt-5.6-terra-pro",      display_name: "GPT-5.6 Terra Pro" },
  { provider: "OpenAI",     id: "gpt-5.4",                display_name: "GPT-5.4" },
  { provider: "Qwen",       id: "qwen3.7-max",            display_name: "Qwen 3.7 Max" },
  { provider: "Qwen",       id: "qwen3.7-plus",           display_name: "Qwen 3.7 Plus" },
  { provider: "xAI",        id: "grok-4.5",               display_name: "Grok 4.5" },
  { provider: "xAI",        id: "grok-4.3",               display_name: "Grok 4.3" },
];

// ── Main ───────────────────────────────────────────────────
export default function ChatbotPage({ navigation }) {
  const { t } = useTranslation();
  const { user, logout } = useCurrentUser(navigation);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef([]);
  const historyReadyRef = useRef(false);
  const usingRemoteHistoryRef = useRef(false);
  const skipNextSaveRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [renameConversationId, setRenameConversationId] = useState(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-5");
  const abortControllerRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    setLoadingHistory(true);
    (async () => {
      try {
        const [remoteResponse, localChat] = await Promise.all([
          fetchChatConversations(),
          loadActiveChat(),
        ]);
        if (!mounted) return;

        const remoteConversations = normalizeRemoteConversations(remoteResponse?.data);
        const activeRemoteId = remoteConversations.some(
          (item) => item.id === localChat.conversationId,
        )
          ? localChat.conversationId
          : remoteConversations[0]?.id ?? null;

        let remoteMessages = [];
        if (activeRemoteId) {
          const messagesResponse = await fetchChatConversationMessages(activeRemoteId);
          remoteMessages = normalizeRemoteMessages(messagesResponse?.data);
          await setActiveChat(activeRemoteId);
          if (remoteMessages.length) {
            await saveChatHistory(remoteMessages, activeRemoteId);
          }
        }

        if (!mounted) return;
        messagesRef.current = remoteMessages;
        setMessages(remoteMessages);
        setConversationId(activeRemoteId);
        setConversations(remoteConversations);
        usingRemoteHistoryRef.current = true;
        historyReadyRef.current = true;
      } catch (_) {
        const chat = await loadActiveChat();
        if (!mounted) return;
        messagesRef.current = chat.messages;
        setMessages(chat.messages);
        setConversationId(chat.conversationId);
        setConversations(chat.conversations);
        usingRemoteHistoryRef.current = false;
        historyReadyRef.current = true;

        if (chat.conversations.length) return;

        try {
          const remoteHistory = await fetchChatHistory(50);
          const remoteMessages = normalizeRemoteChatHistory(remoteHistory?.data);
          if (!mounted || !remoteMessages.length || messagesRef.current.length) return;
          const saved = await saveChatHistory(remoteMessages, null);
          if (!mounted) return;
          messagesRef.current = remoteMessages;
          setMessages(remoteMessages);
          setConversationId(saved.conversationId);
          setConversations(saved.conversations);
        } catch {
          // local history still works when backend history is unavailable
        }
      } finally {
        if (!mounted) return;
        historyReadyRef.current = true;
        setLoadingHistory(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("chatbot_selected_model")
      .then((saved) => { if (saved) setSelectedModel(saved); })
      .catch(() => {});
    fetchChatModels()
      .then((res) => {
        const list = res?.data?.data ?? res?.data ?? [];
        if (Array.isArray(list) && list.length) setAvailableModels(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (!historyReadyRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveChatHistory(messages, conversationId)
      .then((result) => {
        if (result.conversationId && result.conversationId !== conversationId) {
          setConversationId(result.conversationId);
        }
        if (!usingRemoteHistoryRef.current) {
          setConversations(result.conversations);
        }
      })
      .catch(() => {});
  }, [messages, conversationId]);

  const scrollToBottom = useCallback((animated = true) => {
    // สอง pass: ทันทีและรอ layout เสร็จ
    listRef.current?.scrollToEnd?.({ animated });
    const t = setTimeout(() => listRef.current?.scrollToEnd?.({ animated }), 120);
    return () => clearTimeout(t);
  }, []);

  // scroll to bottom on new message or typing indicator
  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, sending]);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetchChatConversations();
      const remoteConversations = normalizeRemoteConversations(response?.data);
      usingRemoteHistoryRef.current = true;
      setConversations(remoteConversations);
      return remoteConversations;
    } catch (_) {
      const nextConversations = await loadChatConversations();
      usingRemoteHistoryRef.current = false;
      setConversations(nextConversations);
      return nextConversations;
    }
  }, []);

  const stopMessage = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSending(false);
    // ทำเครื่องหมาย stopped บน user message ล่าสุด
    setMessages((cur) => {
      const last = cur[cur.length - 1];
      if (last?.role === "user") {
        return [...cur.slice(0, -1), { ...last, stopped: true }];
      }
      return cur;
    });
  }, []);

  const sendMessage = useCallback(async (preset) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;
    const userMsg = createChatMessage("user", text);
    // ล้าง stopped bubble ก่อนที่จะส่งข้อความใหม่
    setMessages((cur) => [...cur.filter((m) => !m.stopped), userMsg]);
    setInput("");
    setSending(true);
    scrollToBottom();
    // abort request เก่าที่ค้างอยู่ก่อนเสมอ
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      let targetConversationId = conversationId;
      if (!targetConversationId) {
        const created = await createChatConversation(text.slice(0, 48));
        targetConversationId = String(extractRemoteConversationId(created?.data) ?? created?.data?.id ?? "");
        if (targetConversationId) {
          setConversationId(targetConversationId);
          await setActiveChat(targetConversationId);
        }
      }

      const res = await sendChatMessage(text, targetConversationId, selectedModel, controller.signal);
      const nextConversationId =
        extractRemoteConversationId(res?.data) ?? targetConversationId;
      if (nextConversationId && String(nextConversationId) !== conversationId) {
        setConversationId(String(nextConversationId));
        await setActiveChat(String(nextConversationId));
      }
      const reply = extractRemoteReply(res?.data);
      setMessages((cur) => [...cur, createChatMessage("bot", reply)]);
      refreshConversations().catch(() => {});
    } catch (e) {
      if (e?.name === "AbortError" || e?.code === "ERR_CANCELED") {
        // user กด stop — ไม่ต้องแสดง error
      } else {
        const serverReply = e?.response?.data?.data?.reply ?? e?.response?.data?.reply;
        if (serverReply) {
          setMessages((cur) => [...cur, createChatMessage("bot", serverReply)]);
        } else {
          setMessages((cur) => [
            ...cur,
            { id: `${Date.now()}-error`, role: "bot", error: true, retryText: text, text: "" },
          ]);
        }
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
    }
  }, [conversationId, input, refreshConversations, selectedModel, sending]);

  const retryMessage = useCallback((text) => {
    setMessages((cur) => cur.filter((m) => !m.error));
    sendMessage(text);
  }, [sendMessage]);

  const startNewChat = useCallback(() => {
    messagesRef.current = [];
    skipNextSaveRef.current = true;
    setConversationId(null);
    setMessages([]);
    setHistoryVisible(false);
    setSelectedConversation(null);
    setActiveChat(null).catch(() => {});
  }, []);

  const openConversation = useCallback((item) => {
    setHistoryVisible(false);
    setSelectedConversation(null);
    skipNextSaveRef.current = true;
    setConversationId(item.id);

    requestAnimationFrame(() => {
      fetchChatConversationMessages(item.id)
        .then(async (nextMessages) => {
          const remoteMessages = normalizeRemoteMessages(nextMessages?.data);
          await setActiveChat(item.id);
          if (remoteMessages.length) {
            await saveChatHistory(remoteMessages, item.id);
          }
          skipNextSaveRef.current = true;
          messagesRef.current = remoteMessages;
          setConversationId(item.id);
          setMessages(remoteMessages);
        })
        .catch(async () => {
          try {
            const localMessages = await loadChatMessages(item.id);
            await setActiveChat(item.id);
            skipNextSaveRef.current = true;
            messagesRef.current = localMessages;
            setConversationId(item.id);
            setMessages(localMessages);
          } catch {
            skipNextSaveRef.current = false;
            Alert.alert(t("chatbot.historyTitle"), t("chatbot.noHistoryHint"));
          }
        });
    });
  }, [t]);

  const openConversationMenu = useCallback((item, event) => {
    const nativeEvent = event?.nativeEvent ?? {};
    setSelectedConversation({
      ...item,
      menuPosition: {
        x: nativeEvent.pageX ?? screenWidth - 72,
        y: nativeEvent.pageY ?? 180,
      },
    });
  }, [screenWidth]);

  const closeConversationMenu = useCallback(() => {
    setSelectedConversation(null);
  }, []);

  const togglePinConversation = useCallback(async () => {
    if (!selectedConversation) return;
    const target = selectedConversation;
    const nextPinned = !target.pinned;
    setSelectedConversation(null);
    setConversations((current) =>
      current.map((item) =>
        item.id === target.id ? { ...item, pinned: nextPinned } : item,
      ),
    );
    try {
      await updateChatConversationRemote(target.id, { pinned: nextPinned });
      await updateChatConversation(target.id, { pinned: nextPinned });
      await refreshConversations();
    } catch (_) {
      updateChatConversation(target.id, {
        pinned: nextPinned,
      }).then(setConversations).catch(() => {
        refreshConversations();
      });
    }
  }, [refreshConversations, selectedConversation]);

  const openRenameConversation = useCallback(() => {
    if (!selectedConversation) return;
    setRenameConversationId(selectedConversation.id);
    setRenameTitle(selectedConversation.title);
    setRenameVisible(true);
    setSelectedConversation(null);
  }, [selectedConversation]);

  const saveRenameConversation = useCallback(async () => {
    const title = renameTitle.trim();
    const targetId = renameConversationId;
    if (!targetId || !title) {
      setRenameVisible(false);
      setRenameConversationId(null);
      return;
    }
    setRenameVisible(false);
    setRenameConversationId(null);
    setRenameTitle("");
    setConversations((current) =>
      current.map((item) =>
        item.id === targetId ? { ...item, title, customTitle: true } : item,
      ),
    );
    try {
      await updateChatConversationRemote(targetId, { title });
      await updateChatConversation(targetId, { title });
      await refreshConversations();
    } catch (_) {
      updateChatConversation(targetId, { title }).then(setConversations).catch(() => {
        refreshConversations();
      });
    }
  }, [refreshConversations, renameConversationId, renameTitle]);

  const deleteConversation = useCallback((item) => {
    Alert.alert(t("chatbot.deleteChat"), t("chatbot.deleteChatConfirm"), [
      { text: t("chatbot.cancel"), style: "cancel" },
      {
        text: t("chatbot.deleteChat"),
        style: "destructive",
        onPress: async () => {
          setConversations((current) =>
            current.filter((conversation) => conversation.id !== item.id),
          );
          if (item.id === conversationId) {
            skipNextSaveRef.current = true;
            messagesRef.current = [];
            setMessages([]);
            setConversationId(null);
          }
          setSelectedConversation(null);
          try {
            await deleteChatConversationRemote(item.id);
            await clearChatHistory(item.id);
            await refreshConversations();
          } catch (_) {
            clearChatHistory(item.id).then(setConversations).catch(() => {
              refreshConversations();
            });
          }
        },
      },
    ]);
  }, [conversationId, refreshConversations, t]);

  const confirmClearHistory = useCallback(() => {
    if (!messages.length) return;
    Alert.alert(t("chatbot.clearHistory"), t("chatbot.clearConfirm"), [
      { text: t("chatbot.cancel"), style: "cancel" },
      {
        text: t("chatbot.clearHistory"),
        style: "destructive",
        onPress: async () => {
          skipNextSaveRef.current = true;
          messagesRef.current = [];
          setMessages([]);
          setConversationId(null);
          try {
            if (conversationId) {
              await deleteChatConversationRemote(conversationId);
            }
            await clearChatHistory(conversationId);
            await refreshConversations();
          } catch (_) {
            clearChatHistory(conversationId).then(setConversations).catch(() => {
              refreshConversations();
            });
          }
        },
      },
    ]);
  }, [conversationId, messages.length, refreshConversations, t]);

  const renderConversationMenu = () => {
    if (!selectedConversation) return null;

    const menuWidth = Math.min(236, screenWidth - 32);
    const menuHeight = 224;
    const triggerX = selectedConversation.menuPosition?.x ?? screenWidth - 72;
    const triggerY = selectedConversation.menuPosition?.y ?? 180;
    const menuLeft = Math.max(
      16,
      Math.min(triggerX - menuWidth + 24, screenWidth - menuWidth - 16),
    );
    const menuTop = Math.max(
      82,
      Math.min(triggerY + 10, screenHeight - menuHeight - 28),
    );

    return (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        <Pressable
          onPress={closeConversationMenu}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "rgba(11, 31, 24, 0.18)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: menuTop,
            left: menuLeft,
            width: menuWidth,
            backgroundColor: "#fff",
            borderRadius: 22,
            padding: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.16,
            shadowRadius: 22,
            elevation: 14,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#102019",
              fontSize: 16,
              fontWeight: "900",
              paddingHorizontal: 10,
              paddingTop: 6,
              paddingBottom: 8,
            }}
          >
            {selectedConversation.title}
          </Text>

          <Pressable
            onPress={togglePinConversation}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 16,
            }}
          >
            <Ionicons
              name={selectedConversation.pinned ? "pin" : "pin-outline"}
              size={22}
              color="#07865F"
            />
            <Text style={{ color: "#102019", fontSize: 17, fontWeight: "800" }}>
              {selectedConversation.pinned ? t("chatbot.unpinChat") : t("chatbot.pinChat")}
            </Text>
          </Pressable>

          <Pressable
            onPress={openRenameConversation}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 16,
            }}
          >
            <Ionicons name="pencil-outline" size={22} color="#07865F" />
            <Text style={{ color: "#102019", fontSize: 17, fontWeight: "800" }}>
              {t("chatbot.renameChat")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              const item = selectedConversation;
              setSelectedConversation(null);
              deleteConversation(item);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              borderRadius: 16,
            }}
          >
            <Ionicons name="trash-outline" size={22} color="#dc2626" />
            <Text style={{ color: "#dc2626", fontSize: 17, fontWeight: "900" }}>
              {t("chatbot.deleteChat")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const selectModel = useCallback((modelId) => {
    setSelectedModel(modelId);
    setModelSelectorVisible(false);
    AsyncStorage.setItem("chatbot_selected_model", modelId).catch(() => {});
  }, []);

  const getModelDisplayName = (modelId) => {
    const found = availableModels.find((m) => (m.id ?? m.model_id ?? m.name) === modelId);
    if (found) return found.display_name ?? found.name ?? modelId;
    // fallback labels for common models
    const labels = {
      "claude-sonnet-5": "Sonnet 5",
      "claude-opus-5": "Opus 5",
      "claude-haiku-4-5": "Haiku 4.5",
      "gpt-4o": "GPT-4o",
      "gemini-2.0-flash": "Gemini Flash",
      "deepseek-chat": "DeepSeek",
    };
    return labels[modelId] ?? modelId.split("/").pop() ?? modelId;
  };

  const groupModelsByProvider = (models) => {
    const groups = {};
    models.forEach((m) => {
      const provider = normalizeProvider(m.provider) ?? "Other";
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push({ ...m, provider });
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  };

  const PROVIDER_ICONS = {
    Claude: { icon: "sparkles", color: "#c96430" },
    OpenAI: { icon: "logo-react", color: "#10a37f" },
    Google: { icon: "planet-outline", color: "#4285f4" },
    Gemini: { icon: "planet-outline", color: "#4285f4" },
    DeepSeek: { icon: "water-outline", color: "#4d6bfe" },
    "Meta AI": { icon: "infinite-outline", color: "#0064e1" },
    Mistral: { icon: "flame-outline", color: "#f05c28" },
    Nova: { icon: "star-outline", color: "#ff9900" },
    Qwen: { icon: "aperture-outline", color: "#615fff" },
    xAI: { icon: "thunderstorm-outline", color: "#1c1c1c" },
  };

  const renderModelSelector = () => {
    const modelList = availableModels.length ? availableModels : FALLBACK_MODELS;
    const grouped = groupModelsByProvider(modelList);

    return (
      <Modal
        visible={modelSelectorVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModelSelectorVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          {/* Backdrop — แยกออกจาก sheet ไม่ให้ block scroll */}
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
            onPress={() => setModelSelectorVisible(false)}
          />
          {/* Sheet */}
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "82%", paddingBottom: Platform.OS === "ios" ? 36 : 20 }}>

            {/* Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#dde6e2" }} />
            </View>

            {/* Title */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
              <Text style={{ color: "#102019", fontSize: 19, fontWeight: "900" }}>เลือกโมเดล AI</Text>
              <Text style={{ color: "#5F7069", fontSize: 14, fontWeight: "600", marginTop: 2 }}>
                กำลังใช้: <Text style={{ color: colors.text, fontWeight: "700" }}>{getModelDisplayName(selectedModel)}</Text>
              </Text>
            </View>

            {/* Provider sections — vertical scroll */}
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {grouped.map(([provider, models]) => {
                const ps = PROVIDER_ICONS[provider] ?? { icon: "hardware-chip-outline", color: "#07865F" };
                return (
                  <View key={provider} style={{ marginBottom: 18 }}>
                    {/* Provider label with real logo */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 10 }}>
                      <AiProviderLogo provider={provider} size={18} />
                      <Text style={{ color: "#3d5248", fontSize: 13, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" }}>{provider}</Text>
                    </View>

                    {/* Model chips — wrap row */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 8 }}>
                      {models.map((m) => {
                        const modelId = m.id ?? m.model_id ?? m.name;
                        const label = m.display_name ?? m.name ?? modelId;
                        const isSelected = selectedModel === modelId;
                        return (
                          <TouchableOpacity
                            key={modelId}
                            onPress={() => selectModel(modelId)}
                            activeOpacity={0.75}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              height: 40,
                              paddingHorizontal: 14,
                              borderRadius: 10,
                              backgroundColor: isSelected ? ps.color : "#f7faf8",
                              borderWidth: 1.5,
                              borderColor: isSelected ? ps.color : "#c8d9d2",
                            }}
                          >
                            {isSelected
                              ? <Ionicons name="checkmark" size={13} color="#fff" />
                              : <AiProviderLogo provider={provider} size={15} />
                            }
                            <Text style={{ color: isSelected ? "#fff" : "#2d4840", fontSize: 15, fontWeight: "700" }}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderRenameDialog = () => {
    if (!renameVisible) return null;

    return (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          justifyContent: "center",
          paddingHorizontal: 22,
        }}
      >
        <Pressable
          onPress={() => {
            setRenameVisible(false);
            setRenameConversationId(null);
          }}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "rgba(11, 31, 24, 0.38)",
          }}
        />
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 26,
            padding: 18,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 14,
          }}
        >
          <Text style={{ color: "#102019", fontSize: 21, fontWeight: "900" }}>
            {t("chatbot.renameChat")}
          </Text>
          <Text style={{ color: "#5F7069", fontSize: 14, fontWeight: "600", marginTop: 4 }}>
            {t("chatbot.renameChatHint")}
          </Text>
          <TextInput
            value={renameTitle}
            onChangeText={setRenameTitle}
            autoFocus
            maxLength={48}
            returnKeyType="done"
            onSubmitEditing={saveRenameConversation}
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#cfe0d8",
              backgroundColor: "#f8fbf9",
              color: "#102019",
              paddingHorizontal: 14,
              fontSize: 17,
              fontWeight: "700",
              marginTop: 16,
            }}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={() => {
                setRenameVisible(false);
                setRenameConversationId(null);
              }}
              activeOpacity={0.75}
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f1f7f4",
              }}
            >
              <Text style={{ color: "#5F7069", fontSize: 15, fontWeight: "900" }}>
                {t("chatbot.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveRenameConversation}
              activeOpacity={0.85}
              disabled={!renameTitle.trim()}
              style={{
                height: 44,
                paddingHorizontal: 18,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: renameTitle.trim() ? "#07865F" : "#5F7069",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>
                {t("chatbot.save")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <HeaderBar name={user.name} photoUrl={user.photoUrl} onNotification={() => navigation.navigate("Notifications")} onLogout={logout} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? 8 : (StatusBar.currentHeight ?? 0)
        }
      >
        {/* Title bar */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryMuted, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chatbubble-ellipses" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.sectionTitle, color: colors.text }}>{t("chatbot.title")}</Text>
            <TouchableOpacity onPress={() => setModelSelectorVisible(true)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
              <AiProviderLogo provider={(() => { const m = (availableModels.length ? availableModels : FALLBACK_MODELS).find(x => (x.id ?? x.name) === selectedModel); return m?.provider ?? "Claude"; })()} size={14} />
              <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "500", letterSpacing: 0 }} numberOfLines={1}>{getModelDisplayName(selectedModel)}</Text>
              <Ionicons name="chevron-down" size={11} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => {
              refreshConversations();
              setHistoryVisible(true);
            }}
            activeOpacity={0.75}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.fieldBg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="time-outline" size={19} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={startNewChat}
            disabled={!messages.length && !conversationId}
            activeOpacity={0.75}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.fieldBg,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: !messages.length && !conversationId ? 0.55 : 1,
            }}
          >
            <Ionicons name="create-outline" size={19} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmClearHistory}
            disabled={!messages.length}
            activeOpacity={0.75}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: messages.length ? colors.fieldBg : colors.fieldDisabled,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: messages.length ? 1 : 0.55,
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatBubble
              item={item}
              onRetry={retryMessage}
              onEdit={(id, text) => {
                // abort request ที่ค้างอยู่ก่อนเสมอ
                abortControllerRef.current?.abort();
                abortControllerRef.current = null;
                setSending(false);
                setMessages((cur) => {
                  const idx = cur.findIndex((m) => m.id === id);
                  if (idx === -1) return cur;
                  // ลบ user bubble นี้ + AI replies ทั้งหมดที่ตามมา จนถึง user bubble ถัดไป
                  let end = idx + 1;
                  while (end < cur.length && cur[end].role !== "user") end++;
                  return [...cur.slice(0, idx), ...cur.slice(end)];
                });
                setInput(text);
                inputRef.current?.focus();
              }}
            />
          )}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
          onLayout={() => listRef.current?.scrollToEnd?.({ animated: false })}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#e6f5ef", alignItems: "center", justifyContent: "center" }}>
                <Ionicons
                  name={loadingHistory ? "time-outline" : "chatbubbles-outline"}
                  size={34}
                  color="#07865F"
                />
              </View>
              <Text style={{ ...typography.secondary, fontSize: 15, textAlign: "center" }}>
                {loadingHistory ? t("chatbot.loadingHistory") : t("chatbot.emptyHint")}
              </Text>
            </View>
          }
          ListFooterComponent={sending ? <TypingBubble /> : null}
        />

        {/* Composer */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 18 : 14 }}>
          <TextInput
            ref={inputRef}
            style={{ ...typography.input, flex: 1, minHeight: 44, maxHeight: 110, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.fieldBg, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10 }}
            allowFontScaling
            value={input}
            onChangeText={setInput}
            placeholder={sending ? t("chatbot.waitingReply") : t("chatbot.placeholder")}
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={2000}
            onSubmitEditing={() => { if (!sending) sendMessage(); }}
          />
          {sending ? (
            <TouchableOpacity
              style={{ width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.fieldBg, borderWidth: 1.5, borderColor: colors.borderStrong }}
              onPress={stopMessage}
              activeOpacity={0.75}
            >
              <Ionicons name="stop" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={{ width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: !input.trim() ? colors.borderStrong : colors.primary }}
              onPress={() => sendMessage()}
              activeOpacity={0.85}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={19} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={historyVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.appBg }}>
          <StatusBar barStyle="dark-content" backgroundColor={colors.appBg} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 18,
              paddingTop: Platform.OS === "ios" ? 18 : 14,
              paddingBottom: 14,
              backgroundColor: colors.surface,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={() => setHistoryVisible(false)}
              activeOpacity={0.75}
              style={{
                width: 42,
                height: 42,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.pageTitle, color: colors.text }}>
                {t("chatbot.historyTitle")}
              </Text>
              <Text style={{ ...typography.secondary, marginTop: 2 }}>
                {t("chatbot.historySubtitle")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={startNewChat}
              activeOpacity={0.86}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                height: 42,
                paddingHorizontal: 14,
                borderRadius: 15,
                backgroundColor: colors.primary,
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ ...typography.button, color: colors.surface, fontSize: 14 }}>
                {t("chatbot.newChat")}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HistoryRow
                item={item}
                active={item.id === conversationId}
                onPress={() => openConversation(item)}
                onMenu={(event) => openConversationMenu(item, event)}
              />
            )}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 28,
              gap: 10,
              flexGrow: conversations.length ? 0 : 1,
            }}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 28 }}>
                <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: "#e6f5ef", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="chatbubbles-outline" size={36} color="#07865F" />
                </View>
                <Text style={{ color: "#102019", fontSize: 19, fontWeight: "900", textAlign: "center" }}>
                  {t("chatbot.noHistory")}
                </Text>
                <Text style={{ color: "#5F7069", fontSize: 14, fontWeight: "600", lineHeight: 22, textAlign: "center" }}>
                  {t("chatbot.noHistoryHint")}
                </Text>
              </View>
            }
          />
          {renderConversationMenu()}
          {renderRenameDialog()}
        </View>
      </Modal>

      {renderModelSelector()}
    </View>
  );
}
