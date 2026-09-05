import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
  findNodeHandle,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AppHeader from "../../../components/AppHeader";
import { stripNamePrefix } from "../../../utils/name";
import FormContainer from "../../../components/expert/FormContainer";
import FormField from "../../../components/expert/FormField";
import InlineDropdown from "../../../components/expert/InlineDropdown";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../../services/api";
import infoApi from "../../../services/infoApi";
import { INFO_API_BASE_URL, STORAGE_KEYS } from "../../../config";
import { fixPhotoUrl } from "../../../utils/image";
import useConfirm from "../../../hook/useConfirm";
import {
  formatThaiDate,
  parseISOToDate,
  toISODate,
} from "../../../utils/thaiDate";

// แปลง value จาก dropdown ไปเป็น label (ใช้ตอนส่ง position เป็น string ให้ API)
const getLabelById = (opts, id) => opts.find((o) => o.id === id)?.label ?? "";

// แปลง ID / label → ID ที่ตรงกับ options (รองรับกรณี backend ส่งชื่อมาแทน ID)
const resolveId = (opts, value) => {
  if (!value) return "";
  const s = String(value);
  if (opts.some((o) => o.id === s)) return s;
  const byLabel = opts.find((o) => o.label === s);
  return byLabel ? byLabel.id : s;
};

const withCacheBust = (url) => {
  if (!url || !/^https?:\/\//.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
};

const isDisplayableImageUri = (uri) =>
  typeof uri === "string" &&
  /^(https?:\/\/|file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/)/.test(
    uri,
  );

const getUploadedPhotoUrl = (payload) => {
  const data = payload?.data ?? payload ?? {};
  return (
    data?.photo_url ??
    data?.picture ??
    data?.avatar ??
    data?.profile_image ??
    data?.profile_photo_url ??
    data?.image_url ??
    data?.url ??
    data?.path ??
    data?.file_url ??
    ""
  );
};

const preparePickedImage = async (asset) => {
  const extension =
    asset.fileName?.split(".").pop()?.toLowerCase() ||
    asset.uri?.split("?")[0]?.split(".").pop()?.toLowerCase() ||
    "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension)
    ? extension
    : "jpg";
  const mimeType =
    asset.mimeType ||
    (safeExtension === "png"
      ? "image/png"
      : safeExtension === "webp"
        ? "image/webp"
        : "image/jpeg");
  const localUri = `${FileSystem.cacheDirectory}profile_${Date.now()}.${safeExtension}`;

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: localUri });
    return {
      uri: localUri,
      type: mimeType,
      name: `photo_${Date.now()}.${safeExtension}`,
    };
  } catch (_) {
    return {
      uri: asset.uri,
      type: mimeType,
      name: asset.fileName || `photo_${Date.now()}.${safeExtension}`,
    };
  }
};

const ProfileForm = ({ navigation, route }) => {
  const { t } = useTranslation();
  const item = route.params?.item;

  const [form, setForm] = useState({
    id_card: item?.id_card || "",
    firstname_th: item?.firstname_th || "",
    lastname_th: item?.lastname_th || "",
    firstname_en: item?.firstname_en || "",
    lastname_en: item?.lastname_en || "",
    faculty_name_th: item?.faculty_name_th || "",
    department_name_th: item?.department_name_th || "",
    prefix: item?.prefix || "", // กรอกเองเป็น string ตรงๆ
    position: item?.position || "", // เก็บเป็น option ID (แปลงเป็น label ตอน save)
    line: "",
    branch: item?.branch || "",
    address: item?.address || "",
    moo: item?.moo || "",
    road: item?.road || "",
    tambon: item?.tambon || "",
    amphoe: item?.amphoe || "",
    province: item?.province || "",
    zipcode: item?.zipcode || "",
    phone_work: item?.phone_work || "",
    phone_mobile: item?.phone_mobile || "",
    email: item?.email || "",
    birthdate: item?.birthdate || "", // เก็บเป็น ISO (ค.ศ.) YYYY-MM-DD
    main_unit: item?.main_unit || "", // เก็บเป็น integer string
    sub_unit: item?.sub_unit || "", // เก็บเป็น integer string
  });

  const { confirm, ConfirmDialog } = useConfirm();
  const [options, setOptions] = useState({
    positions: [],
    lines: [],
    mainUnits: [],
    subUnits: [],
  });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const scrollRef = useRef(null);
  const fieldLayouts = useRef({});
  const lastLocalPhotoUri = useRef("");

  const refs = {
    prefix: useRef(null),
    firstname_th: useRef(null),
    lastname_th: useRef(null),
    firstname_en: useRef(null),
    lastname_en: useRef(null),
    faculty_name_th: useRef(null),
    department_name_th: useRef(null),
    branch: useRef(null),
    address: useRef(null),
    moo: useRef(null),
    road: useRef(null),
    tambon: useRef(null),
    amphoe: useRef(null),
    province: useRef(null),
    zipcode: useRef(null),
    phone_work: useRef(null),
    phone_mobile: useRef(null),
    email: useRef(null),
  };

  const registerFieldLayout = (name) => (event) => {
    fieldLayouts.current[name] = event.nativeEvent.layout.y;
  };

  const scrollToField = (name) => {
    if (Platform.OS !== "ios") return;
    const input = refs[name]?.current;
    const scrollView = scrollRef.current;

    const scrollToY = (y) => {
      if (typeof y !== "number") return;
      scrollView?.scrollTo({
        y: Math.max(y - 170, 0),
        animated: true,
      });
    };

    const nodeHandle = input ? findNodeHandle(input) : null;
    const scrollResponder = scrollView?.getScrollResponder?.();
    if (
      nodeHandle &&
      scrollResponder?.scrollResponderScrollNativeHandleToKeyboard
    ) {
      scrollResponder.scrollResponderScrollNativeHandleToKeyboard(
        nodeHandle,
        120,
        true,
      );
      return;
    }

    scrollToY(fieldLayouts.current[name]);
  };

  const focusField = (name) => {
    refs[name]?.current?.focus();
    requestAnimationFrame(() => {
      setTimeout(() => scrollToField(name), 80);
    });
  };

  const toOptions = (placeholder, rows) => [
    { id: "", label: placeholder },
    ...rows.map((r, i) => ({
      id: String(
        r.id ?? r.dep_id ?? r.sub_dep_id ?? r.department_id ??
          r.main_unit_id ?? r.sub_unit_id ?? i + 1,
      ),
      label:
        r.name ?? r.label ?? r.title ?? r.name_th ?? r.name_en ??
        r.position_name ?? r.line_name ?? r.main_unit_name ?? r.sub_unit_name ?? "",
    })),
  ];

  // Info API แยก master data ของ profile เป็นแต่ละ endpoint
  useEffect(() => {
    const loadAll = async () => {
      const safe = (res) => {
        const body = res.value?.data;
        if (Array.isArray(body)) return body;
        if (Array.isArray(body?.data)) return body.data;
        return [];
      };
      try {
        const [pos, ln, mu] = await Promise.allSettled([
          infoApi.get("/info/expert/positions"),
          infoApi.get("/info/expert/lines"),
          infoApi.get("/info/expert/main-units"),
        ]).then((results) => results.map(safe));
        setOptions({
          positions: toOptions(t("research.profile.positionPlaceholder"), pos),
          lines: toOptions(t("research.profile.linePlaceholder"), ln),
          mainUnits: toOptions(t("research.profile.mainUnitPlaceholder"), mu),
          // ต้องโหลดหลังรู้ main_unit เพราะ backend filter ตาม main_unit_id
          subUnits: [],
        });
      } finally {
        setLoadingOptions(false);
      }
    };
    loadAll();
  }, []);

  const fetchProfile = () => {
    setProfileError(false);
    setLoadingProfile(true);
    api
      .get("/me")
      .then((r) => {
        const data = r.data?.data ?? r.data;
        if (!data) return;
        if (__DEV__)
          console.log("[ProfileForm] GET /me keys:", Object.keys(data));

        const currentPhoto =
          data.photo_url ??
          data.picture ??
          data.avatar ??
          data.profile_image ??
          "";
        if (currentPhoto) setPhotoUrl(fixPhotoUrl(currentPhoto));

        const fullTh = data.full_name_th ?? "";
        const fullEn = data.full_name_en ?? "";
        const splitTh = stripNamePrefix(fullTh).trim().split(/\s+/);
        const splitEn = fullEn.trim().split(/\s+/);

        setForm({
          id_card: data.citizen_id || data.id_card || "",
          firstname_th: stripNamePrefix(
            data.firstname_th || data.first_name_th || splitTh[0] || "",
          ),
          lastname_th:
            data.lastname_th ||
            data.last_name_th ||
            splitTh.slice(1).join(" ") ||
            "",
          firstname_en:
            data.firstname_en || data.first_name_en || splitEn[0] || "",
          lastname_en:
            data.lastname_en ||
            data.last_name_en ||
            splitEn.slice(1).join(" ") ||
            "",
          faculty_name_th: data.faculty_name_th || data.faculty || "",
          department_name_th: data.department_name_th || data.department || "",
          // prefix_id จาก GET /me เป็น string → ตรงกับ id ของ /prefixes
          prefix: String(data.prefix_id || ""),
          // position จาก GET /me เป็น string ชื่อตำแหน่ง → resolveId จะแปลงเป็น option id
          position: String(data.position || ""),
          line: String(data.line_id || ""),
          branch: data.branch ?? "",
          address: data.address ?? "",
          moo: data.moo ?? "",
          road: data.road ?? "",
          tambon: data.tambon ?? "",
          amphoe: data.amphoe ?? "",
          province: data.province ?? "",
          zipcode: data.zipcode ?? "",
          phone_work: data.phone_work ?? "",
          phone_mobile: data.phone_mobile ?? "",
          email: data.email ?? "",
          birthdate: data.birthdate ?? "", // ISO YYYY-MM-DD (ค.ศ.)
          // main_unit / sub_unit จาก GET /me เป็น integer
          main_unit: String(
            data.main_unit ?? data.main_unit_id ?? data.department_id ??
              data.dep_id ?? "",
          ),
          sub_unit: String(
            data.sub_unit ?? data.sub_unit_id ?? data.sub_department_id ??
              data.sub_dep_id ?? "",
          ),
        });
      })
      .catch((err) => {
        if (__DEV__) console.warn("[ProfileForm] GET /me:", err.message);
        setProfileError(true);
      })
      .finally(() => setLoadingProfile(false));
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // หลังจาก options + profile โหลดเสร็จ แปลง position name → option ID
  useEffect(() => {
    if (loadingOptions || loadingProfile) return;
    setForm((prev) => ({
      ...prev,
      position: resolveId(options.positions, prev.position),
      line: resolveId(options.lines, prev.line),
      main_unit: resolveId(options.mainUnits, prev.main_unit),
      // หน่วยงานรองโหลดแยกหลังรู้ main_unit — อย่าล้างค่าที่ GET /me คืนมา
      // ขณะที่ options ยังว่าง เพราะจะทำให้ค่าที่บันทึกไว้หายจากฟอร์ม
      sub_unit: options.subUnits.length
        ? resolveId(options.subUnits, prev.sub_unit)
        : prev.sub_unit,
    }));
  }, [loadingOptions, loadingProfile]);

  // เมื่อเปิดหน้าใหม่ ให้โหลดหน่วยงานรองของหน่วยงานหลักที่บันทึกไว้
  useEffect(() => {
    if (loadingProfile || !form.main_unit) return;
    let cancelled = false;
    infoApi
      .get("/info/expert/sub-units", {
        params: { main_unit_id: form.main_unit },
      })
      .then((r) => {
        if (cancelled) return;
        const rows = Array.isArray(r.data) ? r.data : (r.data?.data ?? []);
        if (rows.length > 0) {
          setOptions((p) => ({
            ...p,
            subUnits: toOptions(t("research.profile.subUnitPlaceholder"), rows),
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        cancelled = true;
      });
    return () => { cancelled = true; };
  }, [loadingProfile, form.main_unit, t]);

  // หลังรายการหน่วยงานรองโหลดเสร็จ ให้ normalize ค่าเดิม (กรณี backend ส่งชื่อมา)
  useEffect(() => {
    if (!options.subUnits.length || !form.sub_unit) return;
    const resolved = resolveId(options.subUnits, form.sub_unit);
    if (resolved !== form.sub_unit) set("sub_unit", resolved);
  }, [options.subUnits]);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !selectedDate) return;
    // toISODate เก็บเป็น ค.ศ. (YYYY-MM-DD) เสมอ
    set("birthdate", toISODate(selectedDate));
  };

  const pickImage = async (source) => {
    try {
      let result;
      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("research.profile.cameraDeniedTitle"),
            t("research.profile.cameraDeniedMsg"),
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("research.profile.galleryDeniedTitle"),
            t("research.profile.galleryDeniedMsg"),
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (result.canceled) return;

      const asset = result.assets[0];
      const pickedImage = await preparePickedImage(asset);
      // แสดงรูปจาก local ทันที ไม่ต้องรอ server
      lastLocalPhotoUri.current = pickedImage.uri;
      setPhotoUrl(pickedImage.uri);
      setPhotoLoading(true);

      const formData = new FormData();
      formData.append("photo", {
        uri: pickedImage.uri,
        type: pickedImage.type,
        name: pickedImage.name,
      });

      // รูป Expert ต้องอัปโหลดเข้า Info API เพื่อให้ backend ผูกเจ้าของจาก
      // Bearer token และบันทึก URL ลง expert2.users.picture
      const res = await infoApi.post("/info/expert/profile/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        transformRequest: (data) => data,
      });
      const serverUrl = getUploadedPhotoUrl(res.data);
      if (__DEV__) {
        console.log(
          "[ProfileForm] server photo URL:",
          res.data,
          "→ extracted:",
          serverUrl,
          "→ fixed:",
          fixPhotoUrl(serverUrl, INFO_API_BASE_URL),
        );
      }
      const fixedServerUrl = withCacheBust(
        fixPhotoUrl(serverUrl, INFO_API_BASE_URL),
      );
      const finalUrl = isDisplayableImageUri(fixedServerUrl)
        ? fixedServerUrl
        : pickedImage.uri;
      setPhotoUrl(finalUrl);
      // อัปเดต AsyncStorage ให้หน้าอื่น (Setting, Chatbot) เห็นรูปใหม่ทันที
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        if (raw) {
          const stored = JSON.parse(raw);
          stored.picture = finalUrl;
          stored.photo_url = finalUrl;
          await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(stored));
        }
      } catch (_) {}
      Alert.alert(
        t("research.profile.photoSuccessTitle"),
        t("research.profile.photoSuccessMsg"),
      );
    } catch (e) {
      console.warn(
        "[ProfileForm] Photo upload:",
        e?.message,
        e?.response?.data,
      );
      Alert.alert(
        t("research.profile.photoErrorTitle"),
        t("research.profile.photoErrorMsg"),
      );
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleChangePhoto = () => {
    const actions = [
      { text: t("research.common.cancel"), style: "cancel" },
      { text: t("research.profile.photoCamera"), onPress: () => pickImage("camera") },
      { text: t("research.profile.photoGallery"), onPress: () => pickImage("gallery") },
    ];
    if (photoUrl) {
      actions.push({
        text: t("research.profile.removePhoto"),
        style: "destructive",
        onPress: removePhoto,
      });
    }
    Alert.alert(t("research.profile.changePhotoTitle"), t("research.profile.changePhotoMsg"), actions);
  };

  const removePhoto = async () => {
    setPhotoLoading(true);
    try {
      const res = await infoApi.post(
        "/info/expert/profile/photo",
        { _method: "DELETE" },
        {
          headers: {
            "Content-Type": "application/json",
            "X-HTTP-Method-Override": "DELETE",
          },
        },
      );
      const fallbackUrl = getUploadedPhotoUrl(res.data);
      const resolvedFallback = fallbackUrl
        ? fixPhotoUrl(fallbackUrl, INFO_API_BASE_URL)
        : "";
      setPhotoUrl(resolvedFallback);
      lastLocalPhotoUri.current = "";
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        if (raw) {
          const stored = JSON.parse(raw);
          stored.picture = resolvedFallback;
          stored.photo_url = resolvedFallback;
          await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(stored));
        }
      } catch (_) {}
      Alert.alert(
        t("research.profile.photoDeleteSuccessTitle"),
        t("research.profile.photoDeleteSuccessMsg"),
      );
    } catch (e) {
      console.warn("[ProfileForm] Photo delete:", e?.message, e?.response?.data);
      Alert.alert(t("research.profile.photoErrorTitle"), t("research.profile.photoDeleteErrorMsg"));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.firstname_th.trim() || !form.lastname_th.trim()) {
      Alert.alert(
        t("research.profile.validation"),
        t("research.profile.validationMsg"),
      );
      return;
    }
    try {
      // position: GET /me เก็บเป็น string ชื่อตำแหน่ง, PUT /me รับเป็น string ด้วย
      // form.position ตอนนี้เป็น option id → ต้องแปลงกลับเป็น label
      const positionLabel = getLabelById(options.positions, form.position);

      const payload = {
        // prefix_id เป็น string ตามที่ API กำหนด (ห้าม parseInt)
        prefix_id: form.prefix || null,
        // position เป็น string ชื่อตำแหน่ง
        position: positionLabel || form.position || null,
        branch: form.branch || null,
        birthdate: form.birthdate || null, // ISO YYYY-MM-DD (ค.ศ.)
        address: form.address || null,
        moo: form.moo || null,
        road: form.road || null,
        tambon: form.tambon || null,
        amphoe: form.amphoe || null,
        province: form.province || null,
        zipcode: form.zipcode || null,
        phone_work: form.phone_work || null,
        phone_mobile: form.phone_mobile || null,
        line_id: form.line || null,
        // main_unit / sub_unit ต้องเป็น integer (ตาม API spec)
        main_unit: form.main_unit ? parseInt(form.main_unit, 10) : null,
        sub_unit: form.sub_unit ? parseInt(form.sub_unit, 10) : null,
      };

      if (__DEV__)
        console.log("[ProfileForm] PUT /me payload:", JSON.stringify(payload));

      await api.put("/me", payload);
      Alert.alert(
        t("research.profile.saveSuccess"),
        t("research.common.savedMsg"),
        [
          {
            text: t("research.profile.ok"),
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (err) {
      const msg =
        err.response?.data?.message ??
        err.message ??
        t("research.common.apiError");
      if (__DEV__) console.warn("[ProfileForm] PUT /me error:", msg);
      Alert.alert(t("research.common.saveFail"), msg);
    }
  };

  const handleReset = () => {
    Alert.alert(
      t("research.profile.resetConfirm"),
      t("research.profile.resetConfirmMsg"),
      [
        { text: t("research.common.cancel"), style: "cancel" },
        {
          text: t("research.profile.resetConfirm"),
          style: "destructive",
          onPress: () =>
            setForm((p) => ({
              ...p,
              prefix: "",
              position: "",
              line: "",
              branch: "",
              address: "",
              moo: "",
              road: "",
              tambon: "",
              amphoe: "",
              province: "",
              zipcode: "",
              phone_work: "",
              phone_mobile: "",
              birthdate: "",
              main_unit: "",
              sub_unit: "",
            })),
        },
      ],
    );
  };

  return (
    <FormContainer className="flex-1 bg-[#f5f7f8]">
      <AppHeader
        title={t("research.profile.editTitle")}
        onBack={() => navigation.goBack()}
      />

      {loadingProfile || loadingOptions ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color="#007a5a" />
          <Text className="text-[13px] text-[#007a5a] font-semibold">
            {t("research.common.loading")}
          </Text>
        </View>
      ) : profileError && !form.firstname_th ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Ionicons name="cloud-offline-outline" size={52} color="#dc2626" />
          <Text className="text-[15px] font-black text-[#dc2626] text-center">
            {t("research.profile.loadFailTitle")}
          </Text>
          <Text className="text-[13px] text-[#6b7a82] text-center">
            {t("research.profile.loadFailProfileMsg")}
          </Text>
          <TouchableOpacity
            className="bg-[#007a5a] rounded-xl px-6 py-[13px] mt-2"
            onPress={fetchProfile}
            activeOpacity={0.85}
          >
            <Text className="text-white text-[13px] font-black">{t("research.profile.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingTop: 18,
            paddingBottom: 60,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          {/* Hero — photo */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl py-5 mb-4 items-center"
            style={{ elevation: 1 }}
          >
            <TouchableOpacity
              onPress={handleChangePhoto}
              activeOpacity={0.8}
              disabled={photoLoading}
              style={{ position: "relative" }}
            >
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  overflow: "hidden",
                  backgroundColor: "#e6f4ef",
                  borderWidth: 2.5,
                  borderColor: "#007a5a",
                }}
              >
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                    onError={(e) => {
                      console.warn(
                        "[ProfileForm] Image load error:",
                        e.nativeEvent.error,
                        "url:",
                        photoUrl,
                      );
                      if (
                        lastLocalPhotoUri.current &&
                        photoUrl !== lastLocalPhotoUri.current
                      ) {
                        setPhotoUrl(lastLocalPhotoUri.current);
                      }
                    }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="person" size={44} color="#7ab8a1" />
                  </View>
                )}
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  backgroundColor: "#007a5a",
                  borderRadius: 14,
                  width: 28,
                  height: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2.5,
                  borderColor: "#fff",
                }}
              >
                {photoLoading ? (
                  <ActivityIndicator size={12} color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "900",
                color: "#3f4d50",
                marginTop: 10,
              }}
            >
              {t("research.profile.editTitle")}
            </Text>
            <Text style={{ fontSize: 11, color: "#9aa6b1", marginTop: 3 }}>
              {t("research.profile.tapPhoto")}
            </Text>
          </View>

          {/* ── ข้อมูลส่วนตัว ── */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
            style={{ elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
              <Ionicons name="person-outline" size={16} color="#00614a" />
              <Text className="text-[13px] font-extrabold text-[#00614a]">
                ข้อมูลส่วนตัว
              </Text>
            </View>
            <FormField
              label={t("research.profile.idCard")}
              value={form.id_card}
              editable={false}
              keyboardType="numeric"
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.firstname_th}
              onLayout={registerFieldLayout("firstname_th")}
              label={t("research.profile.firstnameTh")}
              value={form.firstname_th}
              onChangeText={(v) => set("firstname_th", v)}
              required
              onSubmitEditing={() => focusField("lastname_th")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.lastname_th}
              onLayout={registerFieldLayout("lastname_th")}
              label={t("research.profile.lastnameTh")}
              value={form.lastname_th}
              onChangeText={(v) => set("lastname_th", v)}
              required
              onSubmitEditing={() => focusField("firstname_en")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.firstname_en}
              onLayout={registerFieldLayout("firstname_en")}
              label={t("research.profile.firstnameEn")}
              value={form.firstname_en}
              onChangeText={(v) => set("firstname_en", v)}
              onSubmitEditing={() => focusField("lastname_en")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.lastname_en}
              onLayout={registerFieldLayout("lastname_en")}
              label={t("research.profile.lastnameEn")}
              value={form.lastname_en}
              onChangeText={(v) => set("lastname_en", v)}
            />
            <View className="h-px bg-[#eef1f4]" />
            <View className="p-[14px]">
              <Text className="text-[12px] text-[#888] font-medium mb-[6px]">
                {t("research.profile.birthdate")}
              </Text>
              <TouchableOpacity
                className="flex-row items-center border border-[#e3e7eb] rounded-[10px] px-[12px] bg-[#f8fafb]"
                style={{ height: 44 }}
                activeOpacity={0.7}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color="#007a5a"
                  style={{ marginRight: 8 }}
                />
                <Text
                  className="flex-1 text-[14px]"
                  style={{ color: form.birthdate ? "#1f2a2e" : "#9aa6b1" }}
                >
                  {form.birthdate
                    ? formatThaiDate(form.birthdate)
                    : t("research.profile.birthdatePlaceholder")}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9aa6b1" />
              </TouchableOpacity>
            </View>
          </View>

          {/* iOS date picker */}
          {showDatePicker && Platform.OS === "ios" && (
            <Modal
              transparent
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <View
                className="flex-1 justify-end"
                style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
              >
                <View className="bg-white rounded-t-[20px] pb-8">
                  <View className="flex-row items-center justify-between px-4 py-3 border-b border-[#eef1f4]">
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text className="text-[15px] text-[#6b7a82] font-semibold">
                        {t("research.common.cancel")}
                      </Text>
                    </TouchableOpacity>
                    <Text className="text-[15px] font-black text-[#3f4d50]">
                      {t("research.profile.birthdate")}
                    </Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text className="text-[15px] text-[#007a5a] font-black">
                        {t("research.profile.ok")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={parseISOToDate(form.birthdate)}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    maximumDate={new Date()}
                    locale="th-TH"
                    style={{ height: 200 }}
                  />
                </View>
              </View>
            </Modal>
          )}
          {showDatePicker && Platform.OS === "android" && (
            <DateTimePicker
              value={parseISOToDate(form.birthdate)}
              mode="date"
              display="default"
              onChange={handleDateChange}
              maximumDate={new Date()}
            />
          )}

          {/* ── ข้อมูลการทำงาน ── */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
            style={{ elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
              <Ionicons name="briefcase-outline" size={16} color="#00614a" />
              <Text className="text-[13px] font-extrabold text-[#00614a]">
                {t("research.profile.workInfo")}
              </Text>
            </View>
            <FormField
              ref={refs.faculty_name_th}
              onLayout={registerFieldLayout("faculty_name_th")}
              label={t("research.profile.faculty")}
              value={form.faculty_name_th}
              onChangeText={(v) => set("faculty_name_th", v)}
              onSubmitEditing={() => focusField("department_name_th")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.department_name_th}
              onLayout={registerFieldLayout("department_name_th")}
              label={t("research.profile.department")}
              value={form.department_name_th}
              onChangeText={(v) => set("department_name_th", v)}
              onSubmitEditing={() => focusField("prefix")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.prefix}
              onLayout={registerFieldLayout("prefix")}
              label={t("research.profile.prefix")}
              value={form.prefix}
              onChangeText={(v) => set("prefix", v)}
              onSubmitEditing={() => focusField("branch")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <InlineDropdown
              label={t("research.profile.position")}
              value={form.position}
              options={options.positions}
              onSelect={(v) => set("position", v)}
              searchable
            />
            <View className="h-px bg-[#eef1f4]" />
            <InlineDropdown
              label={t("research.profile.line")}
              value={form.line}
              options={options.lines}
              onSelect={(v) => set("line", v)}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.branch}
              onLayout={registerFieldLayout("branch")}
              label={t("research.profile.branch")}
              value={form.branch}
              onChangeText={(v) => set("branch", v)}
              onSubmitEditing={() => focusField("address")}
            />
          </View>

          {/* ── ที่อยู่ ── */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
            style={{ elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
              <Ionicons name="home-outline" size={16} color="#00614a" />
              <Text className="text-[13px] font-extrabold text-[#00614a]">
                ที่อยู่
              </Text>
            </View>
            <FormField
              ref={refs.address}
              onLayout={registerFieldLayout("address")}
              label={t("research.profile.address")}
              value={form.address}
              onChangeText={(v) => set("address", v)}
              onSubmitEditing={() => focusField("moo")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.moo}
              onLayout={registerFieldLayout("moo")}
              label={t("research.profile.moo")}
              value={form.moo}
              onChangeText={(v) => set("moo", v)}
              keyboardType="numeric"
              onSubmitEditing={() => focusField("road")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.road}
              onLayout={registerFieldLayout("road")}
              label={t("research.profile.road")}
              value={form.road}
              onChangeText={(v) => set("road", v)}
              onSubmitEditing={() => focusField("tambon")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.tambon}
              onLayout={registerFieldLayout("tambon")}
              label={t("research.profile.tambon")}
              value={form.tambon}
              onChangeText={(v) => set("tambon", v)}
              onSubmitEditing={() => focusField("amphoe")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.amphoe}
              onLayout={registerFieldLayout("amphoe")}
              label={t("research.profile.amphoe")}
              value={form.amphoe}
              onChangeText={(v) => set("amphoe", v)}
              onSubmitEditing={() => focusField("province")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.province}
              onLayout={registerFieldLayout("province")}
              label={t("research.profile.province")}
              value={form.province}
              onChangeText={(v) => set("province", v)}
              onSubmitEditing={() => focusField("zipcode")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.zipcode}
              onLayout={registerFieldLayout("zipcode")}
              label={t("research.profile.zipcode")}
              value={form.zipcode}
              onChangeText={(v) => set("zipcode", v)}
              keyboardType="numeric"
              onSubmitEditing={() => focusField("phone_work")}
            />
          </View>

          {/* ── ช่องทางติดต่อ ── */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
            style={{ elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
              <Ionicons name="call-outline" size={16} color="#00614a" />
              <Text className="text-[13px] font-extrabold text-[#00614a]">
                ช่องทางติดต่อ
              </Text>
            </View>
            <FormField
              ref={refs.phone_work}
              onLayout={registerFieldLayout("phone_work")}
              label={t("research.profile.phoneWork")}
              value={form.phone_work}
              onChangeText={(v) => set("phone_work", v)}
              keyboardType="phone-pad"
              onSubmitEditing={() => focusField("phone_mobile")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.phone_mobile}
              onLayout={registerFieldLayout("phone_mobile")}
              label={t("research.profile.phoneMobile")}
              value={form.phone_mobile}
              onChangeText={(v) => set("phone_mobile", v)}
              keyboardType="phone-pad"
              onSubmitEditing={() => focusField("email")}
            />
            <View className="h-px bg-[#eef1f4]" />
            <FormField
              ref={refs.email}
              onLayout={registerFieldLayout("email")}
              label={t("research.profile.email")}
              value={form.email}
              onChangeText={(v) => set("email", v)}
              keyboardType="email-address"
              returnKeyType="done"
            />
          </View>

          {/* ── หน่วยงาน ── */}
          <View
            className="bg-white border border-[#eef1f4] rounded-2xl overflow-hidden mb-4"
            style={{ elevation: 1 }}
          >
            <View className="flex-row items-center gap-2 bg-[#e6f4ef] border-b border-[#eef1f4] px-[14px] py-[11px]">
              <Ionicons name="business-outline" size={16} color="#00614a" />
              <Text className="text-[13px] font-extrabold text-[#00614a]">
                หน่วยงาน
              </Text>
            </View>
            <InlineDropdown
              label={t("research.profile.mainUnit")}
              value={form.main_unit}
              options={options.mainUnits}
              onSelect={async (v) => {
                set("main_unit", v);
                set("sub_unit", "");
                if (v) {
                  try {
                    const r = await infoApi.get("/info/expert/sub-units", {
                      params: { main_unit_id: v },
                    });
                    const rows = Array.isArray(r.data)
                      ? r.data
                      : (r.data?.data ?? []);
                    if (rows.length > 0) {
                      setOptions((p) => ({
                        ...p,
                        subUnits: toOptions(
                          t("research.profile.subUnitPlaceholder"),
                          rows,
                        ),
                      }));
                    }
                  } catch {
                    /* keep full list */
                  }
                }
              }}
              searchable
            />
            <View className="h-px bg-[#eef1f4]" />
            <InlineDropdown
              label={t("research.profile.subUnit")}
              value={form.sub_unit}
              options={options.subUnits}
              onSelect={(v) => set("sub_unit", v)}
              searchable
            />
          </View>

          {/* ── ปุ่มบันทึก ── */}
          <View className="flex-row gap-[10px]">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center gap-2 bg-[#007a5a] rounded-xl py-[13px]"
              style={{ elevation: 2 }}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text className="text-white text-[14px] font-black">
                {t("research.common.save")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center gap-[6px] bg-[#fef2f2] border-[1.5px] border-[#dc2626] rounded-xl px-[18px]"
              onPress={() =>
                confirm({
                  title: t("research.common.resetFormTitle"),
                  message: t("research.common.resetFormMessage"),
                  icon: "refresh",
                  onConfirm: handleReset,
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={17} color="#dc2626" />
              <Text className="text-[#dc2626] text-[14px] font-black">
                {t("research.common.reset")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      <ConfirmDialog />
    </FormContainer>
  );
};

export default ProfileForm;
