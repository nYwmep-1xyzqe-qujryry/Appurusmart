import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import InlineDropdown from "./expert/InlineDropdown";
import { formatThaiDateLong, parseISOToDate, toISODate } from "../utils/thaiDate";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { useEResearchText } from "../screens/e-research/i18n";

const MONTH_LABELS = {
  th: [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

const partsFromValue = (value) => {
  if (!value) return { day: "", month: "", year: "" };
  const date = parseISOToDate(value);
  return {
    day: String(date.getDate()),
    month: String(date.getMonth() + 1),
    year: String(date.getFullYear() + 543),
  };
};

export default function ThaiDateField({
  label,
  value,
  onChange,
  placeholder,
  minimumDate,
  maximumDate,
  emptyDefaultDate = new Date(),
  required = false,
}) {
  const { te, eResearchLanguage } = useEResearchText();
  const displayPlaceholder = placeholder || te("date.placeholder");
  const [parts, setParts] = useState(() => partsFromValue(value));

  useEffect(() => { setParts(partsFromValue(value)); }, [value]);

  const yearOptions = useMemo(() => {
    const fallbackYear = emptyDefaultDate.getFullYear();
    const minYear = minimumDate?.getFullYear() ?? fallbackYear - 100;
    const maxYear = maximumDate?.getFullYear() ?? fallbackYear + 20;
    const rows = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      rows.push({ id: String(year + 543), label: String(year + 543) });
    }
    return rows;
  }, [emptyDefaultDate, minimumDate, maximumDate]);

  const daysInSelectedMonth = parts.month && parts.year
    ? new Date(Number(parts.year) - 543, Number(parts.month), 0).getDate()
    : 31;
  const dayOptions = useMemo(() => Array.from(
    { length: daysInSelectedMonth },
    (_, index) => ({ id: String(index + 1), label: String(index + 1) }),
  ), [daysInSelectedMonth]);
  const monthOptions = useMemo(
    () => MONTH_LABELS[eResearchLanguage].map((monthLabel, index) => ({
      id: String(index + 1),
      label: monthLabel,
    })),
    [eResearchLanguage],
  );

  const selectPart = (key, selectedValue) => {
    const next = { ...parts, [key]: selectedValue };
    if (key === "month" || key === "year") {
      const maxDay = next.month && next.year
        ? new Date(Number(next.year) - 543, Number(next.month), 0).getDate()
        : 31;
      if (Number(next.day) > maxDay) next.day = String(maxDay);
    }
    setParts(next);

    if (!next.day || !next.month || !next.year) return;
    let selectedDate = new Date(Number(next.year) - 543, Number(next.month) - 1, Number(next.day));
    if (minimumDate && selectedDate < minimumDate) selectedDate = minimumDate;
    if (maximumDate && selectedDate > maximumDate) selectedDate = maximumDate;
    onChange?.(toISODate(selectedDate));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}{required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.row}>
        <InlineDropdown
          label={te("date.day")}
          value={parts.day}
          options={dayOptions}
          onSelect={(selected) => selectPart("day", selected)}
          placeholder={te("date.day")}
          containerStyle={[styles.dropdown, { flex: 0.8 }]}
          triggerStyle={styles.trigger}
          selectedTextStyle={styles.numericText}
          compact
        />
        <InlineDropdown
          label={te("date.month")}
          value={parts.month}
          options={monthOptions}
          onSelect={(selected) => selectPart("month", selected)}
          placeholder={te("date.month")}
          containerStyle={[styles.dropdown, { flex: 1.45 }]}
          triggerStyle={styles.trigger}
          compact
        />
        <InlineDropdown
          label={te("date.year")}
          value={parts.year}
          options={yearOptions}
          onSelect={(selected) => selectPart("year", selected)}
          placeholder={te("date.yearShort")}
          searchable
          containerStyle={[styles.dropdown, { flex: 1.1 }]}
          triggerStyle={styles.trigger}
          selectedTextStyle={styles.numericText}
          compact
        />
      </View>
      <View style={[styles.summary, !value && styles.summaryEmpty]}>
        <Ionicons name="calendar-outline" size={17} color={value ? colors.primary : colors.placeholder} />
        <Text style={[styles.summaryText, !value && styles.placeholder]}>
          {value ? formatThaiDateLong(value, eResearchLanguage) : displayPlaceholder}
        </Text>
      </View>
    </View>
  );
}

const styles = {
  wrap: { paddingHorizontal: spacing.card, paddingVertical: 10 },
  label: { ...typography.label, marginBottom: 4 },
  required: { color: colors.danger },
  row: { flexDirection: "row", gap: 8 },
  dropdown: { paddingHorizontal: 0, paddingVertical: 4 },
  trigger: { minHeight: 48, paddingHorizontal: 10 },
  numericText: { fontVariant: ["tabular-nums"] },
  summary: {
    minHeight: 44,
    marginTop: 4,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryEmpty: { backgroundColor: colors.fieldBg },
  summaryText: { ...typography.input, color: colors.text, fontWeight: "600", flex: 1 },
  placeholder: { color: colors.placeholder, fontWeight: "500" },
};
