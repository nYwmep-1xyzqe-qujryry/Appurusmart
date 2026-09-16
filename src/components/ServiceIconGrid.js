import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, hitSlop, radius, serviceColors } from "../theme/tokens";

const SERVICES = [
  { icon: "document-text-outline", ...serviceColors.expert, label: "Expert", url: null },
  { icon: "journal-outline", ...serviceColors.research, label: "e-Research", url: null },
  { icon: "book-outline", ...serviceColors.lms, label: "LMS", url: "https://lms.uru.ac.th" },
  { icon: "videocam-outline", ...serviceColors.meeting, label: "E-Meeting", url: "https://meeting.uru.ac.th" },
  { icon: "people-outline", ...serviceColors.hrms, label: "HRMS", url: "https://hrms.uru.ac.th" },
  { icon: "document-outline", ...serviceColors.document, label: "e-Doc", url: "https://edoc.uru.ac.th" },
  { icon: "school-outline", ...serviceColors.advisor, label: "Advisor", url: "https://advisor.uru.ac.th" },
  { icon: "bar-chart-outline", ...serviceColors.workload, label: "Workload", url: "https://workload.uru.ac.th" },
  { icon: "calendar-number-outline", ...serviceColors.schedule, label: "ตารางสอน", url: "https://academic.uru.ac.th/addteacherNew/show_timetable_teacher.php" },
  { icon: "map-outline", ...serviceColors.classroom, label: "ห้องเรียน", url: "https://academic.uru.ac.th/appl/admin/check_room.asp" },
  { icon: "reader-outline", ...serviceColors.academic, label: "ACD", url: "https://academic.uru.ac.th" },
  { icon: "star-outline", ...serviceColors.quality, label: "AUN-QA", url: "http://aunqa.uru.ac.th" },
  { icon: "car-outline", ...serviceColors.vehicle, label: "จองรถ", url: "http://202.29.52.231/reserve/public/login" },
];

const ITEMS_PER_PAGE = 8;
const TRANSLATED_LABELS = {
  จองรถ: "services.bookCar",
  ตารางสอน: "services.schedule",
  ห้องเรียน: "services.classroom",
};

const webOutline = Platform.OS === "web" ? { outlineStyle: "none" } : {};

const ServiceIconGrid = ({ navigation }) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const getLabel = (item) =>
    TRANSLATED_LABELS[item.label] ? t(TRANSLATED_LABELS[item.label]) : item.label;

  const handlePress = (item) => {
    if (item.label === "e-Research") {
      navigation?.navigate("EResearch");
    } else if (item.label === "Expert") {
      navigation?.navigate("Research");
    } else if (item.url) {
      navigation?.navigate("InAppBrowser", {
        url: item.url,
        title: getLabel(item),
      });
    }
  };

  const pages = [];
  for (let i = 0; i < SERVICES.length; i += ITEMS_PER_PAGE) {
    const chunk = [...SERVICES.slice(i, i + ITEMS_PER_PAGE)];
    while (chunk.length < ITEMS_PER_PAGE) chunk.push({ spacer: true });
    pages.push(chunk);
  }

  return (
    <View
      className="pt-[4px] px-[2px]"
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
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
                      {row.map((item, colIndex) =>
                        item.spacer ? (
                          <View key={colIndex} className="flex-1" />
                        ) : (
                          <TouchableOpacity
                            key={colIndex}
                            className="flex-1 items-center"
                            style={[{ minHeight: 86 }, webOutline]}
                            onPress={() => handlePress(item)}
                            activeOpacity={0.78}
                            hitSlop={hitSlop}
                          >
                            <View
                              className="w-[56px] h-[56px] items-center justify-center mb-[7px]"
                              style={[
                                {
                                  backgroundColor: item.backgroundColor,
                                  borderRadius: radius.md,
                                  borderWidth: 1,
                                  borderColor: "rgba(15,122,85,0.08)",
                                },
                                webOutline,
                              ]}
                            >
                              <Ionicons name={item.icon} size={24} color={item.iconColor} />
                            </View>
                            <Text
                              className="text-[11px] text-center leading-[15px]"
                              style={{ color: colors.text, fontWeight: "700" }}
                              numberOfLines={2}
                            >
                              {getLabel(item)}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
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
    </View>
  );
};

export default ServiceIconGrid;
