import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import FormContainer from "../../components/expert/FormContainer";
import FormField from "../../components/expert/FormField";
import InlineDropdown from "../../components/expert/InlineDropdown";
import KeyboardAwareScrollView from "../../components/expert/KeyboardAwareScrollView";
import ThaiDateField from "../../components/ThaiDateField";
import useConfirm from "../../hook/useConfirm";
import useLrdResource from "../../hook/useLrdResource";
import { getLrd, getLrdErrorMessage, postLrd, LRD_ENDPOINTS } from "../../services/lrdApi";
import {
  DEGREE_OPTIONS,
  DEPARTMENT_OPTIONS,
  EXPERTISE_GROUP_OPTIONS,
  FACULTY_OPTIONS,
  RESEARCH_FIELD_OPTIONS,
  WORK_GROUP_OPTIONS,
  buildYearOptions,
  getLabel,
} from "./mockOptions";
import { useEResearchText } from "./i18n";

const FORM_COLORS = {
  ink: "#1F302A",
  body: "#33483F",
  muted: "#5F7069",
  primary: "#0F7A55",
  primaryDark: "#174D42",
  sectionBg: "#F1F7F4",
  border: "#DCE8E3",
  divider: "#E5ECE9",
  editingBg: "#FFF8E6",
  gold: "#8A6412",
  goldBg: "#FFF3D2",
  lavenderBg: "#F3EEFA",
  lavenderText: "#68458C",
  peachBg: "#FFF0E8",
  peachText: "#A8542A",
};

const SECTION_TONES = {
  mint: { backgroundColor: FORM_COLORS.sectionBg, color: FORM_COLORS.primaryDark },
  lavender: { backgroundColor: FORM_COLORS.lavenderBg, color: FORM_COLORS.lavenderText },
  peach: { backgroundColor: FORM_COLORS.peachBg, color: FORM_COLORS.peachText },
};

const SectionHeader = ({ icon, title, tone = "mint" }) => {
  const colors = SECTION_TONES[tone] ?? SECTION_TONES.mint;
  return (
    <View className="flex-row items-center gap-2 border-b px-[14px] py-[11px]" style={{ backgroundColor: colors.backgroundColor, borderBottomColor: FORM_COLORS.divider }}>
      <Ionicons name={icon} size={16} color={colors.color} />
      <Text className="text-[14px] font-extrabold" style={{ color: colors.color }}>{title}</Text>
    </View>
  );
};

const Divider = () => <View className="h-px" style={{ backgroundColor: FORM_COLORS.divider }} />;

// ── ข้อมูลส่วนตัว ─────────────────────────────────────────────
const EMPTY_PROFILE = {
  workGroup: "academic",
  prefix: "นาย",
  firstName: "",
  lastName: "",
  faculty: "",
  department: "",
  position: "",
  address: "",
  birthdate: "",
  phone: "",
  email: "",
  lineId: "",
  idCard: "",
};

const normalizeProfile = (data) => {
  if (!data) return EMPTY_PROFILE;
  // faculty/department มาเป็น object { id, name } หรือ id ตรงๆ
  const facultyId = data.faculty?.id ?? data.faculty_id ?? data.faculty ?? "";
  const departmentId = data.department?.id ?? data.branch_id ?? data.department ?? "";
  return {
    workGroup: data.workGroup ?? data.work_group ?? "academic",
    prefix: data.prefix ?? "นาย",
    firstName: data.firstName ?? data.first_name ?? "",
    lastName: data.lastName ?? data.last_name ?? "",
    faculty: String(facultyId),
    department: String(departmentId),
    position: data.position ?? "",
    address: data.address ?? "",
    birthdate: data.birthdate ?? "",
    phone: data.phone ?? data.tel ?? "",
    email: data.email ?? "",
    lineId: data.lineId ?? data.line_id ?? "",
    idCard: data.idCard ?? data.id_card ?? "",
  };
};

const PersonalInfoCard = () => {
  const { te } = useEResearchText();
  const YEAR_OPTIONS = buildYearOptions(te("researcher.gradYearPlaceholder"));
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const { items: faculties } = useLrdResource(LRD_ENDPOINTS.faculties);
  const { items: branches } = useLrdResource(LRD_ENDPOINTS.branches, {
    params: form.faculty ? { faculty_id: form.faculty } : {},
  });
  const facultyOptions = faculties.length > 0
    ? [{ id: "", label: te("researcher.facultyPlaceholder") }, ...faculties.map((item) => ({
        id: String(item.id),
        label: item.name_th ?? item.facultyname ?? item.name ?? `คณะ ${item.id}`,
      }))]
    : FACULTY_OPTIONS;
  const departmentOptions = branches.length > 0
    ? [{ id: "", label: te("researcher.departmentPlaceholder") }, ...branches.map((item) => ({
        id: String(item.id),
        label: item.name_th ?? item.branchname ?? item.name ?? `สาขา ${item.id}`,
      }))]
    : DEPARTMENT_OPTIONS;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLrd(LRD_ENDPOINTS.researcherMe)
      .then((res) => {
        const normalized = normalizeProfile(res.data?.data ?? res.data);
        if (!cancelled) { setProfile(normalized); setForm(normalized); }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const set = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      Alert.alert(te("common.requiredTitle"), te("researcher.requiredPersonalMessage"));
      return;
    }
    setSaving(true);
    const payload = {
      prefix: form.prefix,
      firstName: form.firstName,
      lastName: form.lastName,
      faculty: form.faculty ? { id: Number(form.faculty) } : null,
      department: form.department ? { id: Number(form.department) } : null,
      position: form.position,
      address: form.address,
      birthdate: form.birthdate,
      phone: form.phone,
      email: form.email,
      lineId: form.lineId,
      workGroup: form.workGroup,
    };
    try {
      await postLrd(LRD_ENDPOINTS.researcherMe, payload);
      setProfile(form);
      Alert.alert(te("common.saveSuccess"), te("researcher.saveMessage"));
    } catch (error) {
      Alert.alert(te("common.saveFailed"), getLrdErrorMessage(error, te("common.tryAgain")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="bg-white rounded-2xl items-center justify-center py-9 mb-4" style={{ elevation: 1, borderWidth: 1, borderColor: FORM_COLORS.border }}>
        <ActivityIndicator size="small" color={FORM_COLORS.primary} />
      </View>
    );
  }

  return (
    <View className="bg-white rounded-2xl overflow-hidden mb-4" style={{ elevation: 1, borderWidth: 1, borderColor: FORM_COLORS.border }}>
      <SectionHeader icon="person-outline" title={te("researcher.title")} />

      <View className="p-[14px]">
        <Text className="text-[13px] font-medium mb-[8px]" style={{ color: FORM_COLORS.muted }}>{te("researcher.workGroup")}</Text>
        <View className="flex-row gap-6">
          {WORK_GROUP_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              className="flex-row items-center gap-2"
              activeOpacity={0.7}
              onPress={() => set("workGroup", opt.id)}
            >
              <Ionicons
                name={form.workGroup === opt.id ? "radio-button-on" : "radio-button-off"}
                size={19}
                color={form.workGroup === opt.id ? FORM_COLORS.primary : "#8CA49A"}
              />
              <Text className="text-[14px]" style={{ color: FORM_COLORS.ink }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Divider />

      <FormField label={te("researcher.prefix")} value={form.prefix} onChangeText={(v) => set("prefix", v)} />
      <Divider />
      <FormField label={te("researcher.firstName")} value={form.firstName} onChangeText={(v) => set("firstName", v)} required />
      <Divider />
      <FormField label={te("researcher.lastName")} value={form.lastName} onChangeText={(v) => set("lastName", v)} required />
      <Divider />
      <InlineDropdown label={te("researcher.faculty")} value={form.faculty} options={facultyOptions} onSelect={(v) => { set("faculty", v); set("department", ""); }} searchable />
      <Divider />
      <InlineDropdown label={te("researcher.department")} value={form.department} options={departmentOptions} onSelect={(v) => set("department", v)} searchable />
      <Divider />
      <FormField label={te("researcher.position")} value={form.position} onChangeText={(v) => set("position", v)} />
      <Divider />
      <FormField label={te("researcher.address")} value={form.address} onChangeText={(v) => set("address", v)} multiline />
      <Divider />

      <ThaiDateField
        label={te("researcher.birthdate")}
        value={form.birthdate}
        onChange={(value) => set("birthdate", value)}
        placeholder={te("researcher.birthdatePlaceholder")}
        maximumDate={new Date()}
        emptyDefaultDate={new Date(new Date().getFullYear() - 30, 0, 1)}
      />

      <FormField label={te("researcher.phone")} value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
      <Divider />
      <FormField label={te("researcher.email")} value={form.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" />
      <Divider />
      <FormField label="Line ID" value={form.lineId} onChangeText={(v) => set("lineId", v)} />
      <Divider />
      <FormField label={te("researcher.idCard")} value={form.idCard} onChangeText={(v) => set("idCard", v.replace(/[^0-9]/g, "").slice(0, 13))} keyboardType="numeric" placeholder={te("researcher.idCardPlaceholder")} />

      <View className="px-[14px] pt-2 pb-[14px]">
        <TouchableOpacity
          className="flex-row items-center justify-center gap-2 rounded-xl py-[13px]"
          style={{ backgroundColor: FORM_COLORS.primary, elevation: 2, opacity: saving ? 0.65 : 1 }}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
          <Text className="text-white text-[15px] font-black">{te("researcher.updateInfo")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── วุฒิการศึกษา ──────────────────────────────────────────────
const EducationSection = () => {
  const { te } = useEResearchText();
  const YEAR_OPTIONS = buildYearOptions(te("researcher.gradYearPlaceholder"));
  const { items, loading, saving, create, update, remove } = useLrdResource(LRD_ENDPOINTS.educations);
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingItem, setEditingItem] = useState(null);
  const emptyEducation = { year: "", degree: "", qualification: "", major: "", university: "" };
  const [form, setForm] = useState(emptyEducation);

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openNew = () => { setEditingItem(null); setForm(emptyEducation); };
  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      year: item.year ?? "",
      degree: item.degree ?? "",
      qualification: item.qualification ?? "",
      major: item.major ?? item.course ?? "",
      university: item.university ?? "",
    });
  };

  const handleSave = async () => {
    if (!form.year || !form.degree || !form.qualification.trim() || !form.major.trim() || !form.university.trim()) {
      Alert.alert(te("common.requiredTitle"), te("researcher.educationRequiredMessage"));
      return;
    }
    try {
      const educationData = { ...form, course: form.major.trim() };
      editingItem ? await update(editingItem.id, educationData) : await create(educationData);
      openNew();
    } catch (error) {
      Alert.alert(te("common.saveFailed"), error.message ?? te("common.tryAgain"));
    }
  };

  const handleDelete = (item) => {
    confirm({
      title: te("common.deleteTitle"),
      message: te("project.deleteConfirm"),
      icon: "trash-outline",
      onConfirm: async () => {
        try {
          await remove(item.id);
          if (editingItem?.id === item.id) openNew();
        } catch (error) {
          Alert.alert(te("common.deleteFailed"), error.message ?? te("common.tryAgain"));
        }
      },
    });
  };

  return (
    <View className="bg-white rounded-2xl overflow-hidden mb-4" style={{ elevation: 1, borderWidth: 1, borderColor: FORM_COLORS.border }}>
      <SectionHeader icon="school-outline" title={te("researcher.educationTitle")} tone="lavender" />
      {loading ? (
        <View className="flex-row items-center justify-center py-7 gap-[10px]">
          <ActivityIndicator size="small" color={FORM_COLORS.primary} />
          <Text className="text-[14px]" style={{ color: FORM_COLORS.muted }}>{te("common.loading")}</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="items-center py-7">
          <Ionicons name="folder-open-outline" size={36} color={FORM_COLORS.muted} />
          <Text className="text-[14px] font-bold mt-2" style={{ color: FORM_COLORS.ink }}>{te("researcher.educationEmpty")}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View className="flex-row items-center bg-white border-b border-[#e3e7eb] px-3 py-3">
              {[{ w: 130, l: te("researcher.degree") }, { w: 210, l: te("researcher.qualification") }, { w: 180, l: te("researcher.university") }, { w: 70, l: te("date.yearShort") }, { w: 84, l: te("common.actions") }].map((c, i, arr) => (
                <Text key={i} className="text-[12px] font-extrabold text-[#5F7069] uppercase px-1" style={{ width: c.w, textAlign: i === arr.length - 1 ? "center" : "left" }}>{c.l}</Text>
              ))}
            </View>
            {items.map((item) => (
              <View key={item.id} className="flex-row items-center px-3 py-3 border-b border-[#eef1f4]" style={editingItem?.id === item.id ? { backgroundColor: FORM_COLORS.editingBg } : {}}>
                <Text className="text-[13px] text-[#33483f] px-1" style={{ width: 130 }} numberOfLines={2}>{getLabel(DEGREE_OPTIONS, item.degree) || "-"}</Text>
                <Text className="text-[14px] font-semibold text-[#1f2a2e] px-3" style={{ width: 210, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }} numberOfLines={2}>
                  {[item.qualification, item.major ?? item.course].filter(Boolean).join(" · ") || "-"}
                </Text>
                <Text className="text-[13px] text-[#33483f] px-3" style={{ width: 180, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }} numberOfLines={2}>{item.university || "-"}</Text>
                <View className="px-1" style={{ width: 70 }}>
                  <View className="self-start rounded-full px-[8px] py-[3px]" style={{ backgroundColor: FORM_COLORS.goldBg }}>
                    <Text className="text-[12px] font-extrabold" style={{ color: FORM_COLORS.gold }}>{item.year || "-"}</Text>
                  </View>
                </View>
                <View className="flex-row gap-[6px] justify-center" style={{ width: 84 }}>
                  <TouchableOpacity className="w-[32px] h-[32px] rounded-lg bg-[#fff4e0] items-center justify-center" onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={16} color="#a8631a" />
                  </TouchableOpacity>
                  <TouchableOpacity className="w-[32px] h-[32px] rounded-lg bg-[#fde7e7] items-center justify-center" onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={16} color="#df4c4b" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Divider />
      <View className="p-[14px] gap-[2px]">
        <Text className="text-[14px] font-extrabold text-[#33483f] mb-1">{editingItem ? te("researcher.educationEdit") : te("researcher.educationAdd")}</Text>
      </View>
      <InlineDropdown label={te("researcher.degree")} value={form.degree} options={DEGREE_OPTIONS} onSelect={(v) => setField("degree", v)} placeholder={te("researcher.degreePlaceholder")} />
      <FormField label={te("researcher.qualification")} value={form.qualification} onChangeText={(v) => setField("qualification", v)} />
      <FormField label={te("researcher.major")} value={form.major} onChangeText={(v) => setField("major", v)} />
      <FormField label={te("researcher.university")} value={form.university} onChangeText={(v) => setField("university", v)} />
      <InlineDropdown label={te("researcher.gradYear")} value={form.year} options={YEAR_OPTIONS} onSelect={(v) => setField("year", v)} searchable />
      <View className="flex-row gap-[10px] px-[14px] pt-2 pb-[14px]">
        <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 bg-[#07865F] rounded-xl py-3" style={{ opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name={editingItem ? "checkmark-circle" : "add-circle"} size={17} color="#fff" />
              <Text className="text-white text-[14px] font-black">{editingItem ? te("common.saveEdit") : te("common.add")}</Text>
            </>
          )}
        </TouchableOpacity>
        {editingItem && (
          <TouchableOpacity className="flex-row items-center gap-[6px] bg-[#f4f6f8] rounded-xl px-4" onPress={openNew}>
            <Text className="text-[#5F7069] text-[14px] font-bold">{te("common.cancel")}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ConfirmDialog />
    </View>
  );
};

// ── ความเชี่ยวชาญ ─────────────────────────────────────────────
const ExpertiseSection = ({ scrollRef }) => {
  const { te } = useEResearchText();
  const { items, loading, saving, create, update, remove } = useLrdResource(LRD_ENDPOINTS.expertises);
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ nameTh: "", nameEn: "", group: "", field: "" });
  const formRef = useRef(null);

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));
  const openNew = () => { setEditingItem(null); setForm({ nameTh: "", nameEn: "", group: "", field: "" }); };
  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      nameTh: item.nameTh ?? "",
      nameEn: item.nameEn ?? "",
      group: String(item.group ?? item.group_id ?? ""),
      field: String(item.field ?? item.field_id ?? ""),
    });
    setTimeout(() => {
      formRef.current?.measureLayout(
        scrollRef?.current,
        (_x, y) => scrollRef?.current?.scrollTo({ y: y - 16, animated: true }),
        () => scrollRef?.current?.scrollToEnd({ animated: true }),
      );
    }, 100);
  };

  const handleSave = async () => {
    if (!form.nameTh.trim() || !form.group || !form.field) {
      Alert.alert(te("common.requiredTitle"), te("researcher.expertiseRequiredMessage"));
      return;
    }
    try {
      const payload = {
        nameTh: form.nameTh.trim(),
        nameEn: form.nameEn.trim() || null,
        group: String(form.group),
        field: String(form.field),
      };
      editingItem ? await update(editingItem.id, payload) : await create(payload);
      openNew();
    } catch (error) {
      Alert.alert(te("common.saveFailed"), error.message ?? te("common.tryAgain"));
    }
  };

  const handleDelete = (item) => {
    confirm({
      title: te("common.deleteTitle"),
      message: te("project.deleteConfirm"),
      icon: "trash-outline",
      onConfirm: async () => {
        try {
          await remove(item.id);
          if (editingItem?.id === item.id) openNew();
        } catch (error) {
          Alert.alert(te("common.deleteFailed"), error.message ?? te("common.tryAgain"));
        }
      },
    });
  };

  return (
    <View className="bg-white rounded-2xl overflow-hidden mb-4" style={{ elevation: 1, borderWidth: 1, borderColor: FORM_COLORS.border }}>
      <SectionHeader icon="flask-outline" title={te("researcher.expertiseTitle")} tone="peach" />
      {loading ? (
        <View className="flex-row items-center justify-center py-7 gap-[10px]">
          <ActivityIndicator size="small" color={FORM_COLORS.primary} />
          <Text className="text-[14px]" style={{ color: FORM_COLORS.muted }}>{te("common.loading")}</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="items-center py-7">
          <Ionicons name="folder-open-outline" size={36} color={FORM_COLORS.muted} />
          <Text className="text-[14px] font-bold mt-2" style={{ color: FORM_COLORS.ink }}>{te("researcher.expertiseEmpty")}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View className="flex-row items-center bg-white border-b border-[#e3e7eb] px-3 py-3">
              {[{ w: 160, l: te("researcher.nameTh") }, { w: 160, l: te("researcher.nameEn") }, { w: 170, l: te("researcher.group") }, { w: 140, l: te("researcher.field") }, { w: 84, l: te("common.actions") }].map((c, i, arr) => (
                <Text key={i} className="text-[12px] font-extrabold text-[#5F7069] uppercase px-1" style={{ width: c.w, textAlign: i === arr.length - 1 ? "center" : "left" }}>{c.l}</Text>
              ))}
            </View>
            {items.map((item) => (
              <View key={item.id} className="flex-row items-center px-3 py-3 border-b border-[#eef1f4]" style={editingItem?.id === item.id ? { backgroundColor: FORM_COLORS.editingBg } : {}}>
                <Text className="text-[14px] font-semibold text-[#1f2a2e] px-1" style={{ width: 160 }} numberOfLines={2}>{item.nameTh || "-"}</Text>
                <Text className="text-[13px] text-[#33483f] px-3" style={{ width: 160, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }} numberOfLines={2}>{item.nameEn || "-"}</Text>
                <Text className="text-[13px] text-[#33483f] px-3" style={{ width: 170, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }} numberOfLines={2}>{getLabel(EXPERTISE_GROUP_OPTIONS, String(item.group ?? "")) || "-"}</Text>
                <Text className="text-[13px] text-[#33483f] px-3" style={{ width: 140, borderLeftWidth: 1, borderLeftColor: "#eef1f4" }} numberOfLines={2}>{getLabel(RESEARCH_FIELD_OPTIONS, String(item.field ?? "")) || "-"}</Text>
                <View className="flex-row gap-[6px] justify-center" style={{ width: 84 }}>
                  <TouchableOpacity className="w-[32px] h-[32px] rounded-lg bg-[#fff4e0] items-center justify-center" onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={16} color="#a8631a" />
                  </TouchableOpacity>
                  <TouchableOpacity className="w-[32px] h-[32px] rounded-lg bg-[#fde7e7] items-center justify-center" onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={16} color="#df4c4b" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Divider />
      <View ref={formRef} className="p-[14px] pb-[2px]">
        <Text className="text-[14px] font-extrabold text-[#33483f]">{editingItem ? te("researcher.expertiseEdit") : te("researcher.expertiseAdd")}</Text>
      </View>
      <InlineDropdown label={te("researcher.group")} value={form.group} options={EXPERTISE_GROUP_OPTIONS} onSelect={(v) => setField("group", v)} required placeholder={te("researcher.groupPlaceholder")} />
      <InlineDropdown label={te("researcher.field")} value={form.field} options={RESEARCH_FIELD_OPTIONS} onSelect={(v) => setField("field", v)} required placeholder={te("researcher.fieldPlaceholder")} />
      <FormField label={te("researcher.nameTh")} value={form.nameTh} onChangeText={(v) => setField("nameTh", v)} required />
      <FormField label={te("researcher.nameEn")} value={form.nameEn} onChangeText={(v) => setField("nameEn", v)} />
      <View className="flex-row gap-[10px] px-[14px] pt-2 pb-[14px]">
        <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3" style={{ backgroundColor: FORM_COLORS.primary, opacity: saving ? 0.6 : 1 }} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name={editingItem ? "checkmark-circle" : "add-circle"} size={17} color="#fff" />
              <Text className="text-white text-[14px] font-black">{editingItem ? te("common.saveEdit") : te("common.add")}</Text>
            </>
          )}
        </TouchableOpacity>
        {editingItem && (
          <TouchableOpacity className="flex-row items-center gap-[6px] bg-[#f4f6f8] rounded-xl px-4" onPress={openNew}>
            <Text className="text-[#5F7069] text-[14px] font-bold">{te("common.cancel")}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ConfirmDialog />
    </View>
  );
};

export default function ResearcherForm({ navigation }) {
  const { te } = useEResearchText();
  const scrollRef = useRef(null);
  return (
    <FormContainer className="flex-1 bg-[#FBF8F2]">
      <AppHeader title={te("researcher.title")} onBack={() => navigation.goBack()} />
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 18, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <PersonalInfoCard />
        <EducationSection />
        <ExpertiseSection scrollRef={scrollRef} />
      </KeyboardAwareScrollView>
    </FormContainer>
  );
}
