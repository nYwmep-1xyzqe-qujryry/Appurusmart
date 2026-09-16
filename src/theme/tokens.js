import { Platform } from "react-native";

export const colors = {
  primary: "#07865F",
  primaryDark: "#174D42",
  primaryDeep: "#174D42",
  primaryLight: "#07865F",
  primaryMuted: "#E8F4EF",
  primarySoft: "#F4F8F5",
  onPrimary: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#F8FCFA",
  appBg: "#F4F8F5",
  fieldBg: "#F8FCFA",
  fieldDisabled: "#F2F5F3",
  rowBg: "#ffffff",
  rowEditingBg: "#E8F4EF",
  editActionBg: "#F8E8B0",
  border: "#DCE8E3",
  borderStrong: "#B8C4BF",
  text: "#263632",
  textMuted: "#5F7069",
  textSoft: "#5F7069",
  placeholder: "#9AA9A3",
  danger: "#D92D20",
  warning: "#8A6412",
  brandYellow: "#D5A72C",
  brandYellowDark: "#7A5C14",
  brandYellowSoft: "#F8E8B0",
  surfaceWarning: "#FFF8E1",
  borderWarning: "#E9D28A",
  surfaceDanger: "#FFF5F4",
  borderDanger: "#fecaca",

  // ชุดสีข้อความมาตรฐาน — คุม contrast ให้ข้อความทั่วไปอ่านได้บนพื้นขาวและ appBg
  primaryText: "#263632",
  secondaryText: "#5F7069",
  mutedText: "#9AA9A3",
  successText: "#07865F",
  dangerText: "#D92D20",
  accentText: "#7A5C14",
};

// Accent colors identify services without turning their labels into colored text.
export const serviceColors = {
  expert: { iconColor: "#1A6B3C", backgroundColor: "#E8F5EE" },
  research: { iconColor: "#0F7A55", backgroundColor: "#D6F0E3" },
  lms: { iconColor: "#1A6B3C", backgroundColor: "#E8F5EE" },
  meeting: { iconColor: "#185FA5", backgroundColor: "#E8F0FB" },
  hrms: { iconColor: "#E65100", backgroundColor: "#FFF3E0" },
  document: { iconColor: "#C62828", backgroundColor: "#FCE4EC" },
  advisor: { iconColor: "#7B1FA2", backgroundColor: "#F3E5F5" },
  workload: { iconColor: "#00838F", backgroundColor: "#E0F7FA" },
  schedule: { iconColor: "#F57F17", backgroundColor: "#FFF8E1" },
  classroom: { iconColor: "#2E7D32", backgroundColor: "#E8F5E9" },
  academic: { iconColor: "#BF360C", backgroundColor: "#FBE9E7" },
  quality: { iconColor: "#4527A0", backgroundColor: "#EDE7F6" },
  vehicle: { iconColor: "#1565C0", backgroundColor: "#E3F2FD" },
};

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
};

export const spacing = {
  screen: 16,
  fieldX: 14,
  fieldY: 12,
  card: 16,
};

export const typography = {
  pageTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: 0,
    color: colors.primaryDark,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.primaryDark,
  },
  body: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "400",
    letterSpacing: 0,
    color: colors.text,
  },
  button: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0,
  },
  secondary: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    letterSpacing: 0,
    color: colors.textSoft,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: 0,
    color: colors.text,
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    letterSpacing: 0,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
    letterSpacing: 0,
    color: colors.textSoft,
  },
  numeric: {
    fontVariant: ["tabular-nums"],
    letterSpacing: 0,
  },
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  floating: Platform.select({
    ios: {
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.16,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 16 },
    default: {},
  }),
};

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };
