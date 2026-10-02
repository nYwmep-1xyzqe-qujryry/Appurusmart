import React, { useEffect, useMemo, useState } from "react";
import { Modal, StatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AnnouncementImage from "./AnnouncementImage";
import {
  clampAnnouncementImageTranslation,
  getAnnouncementImageBounds,
} from "../utils/announcementImageViewer";

const MAX_SCALE = 4;

export default function AnnouncementImageViewer({
  visible,
  uri,
  fallbackUri,
  alt,
  imageWidth,
  imageHeight,
  cacheKey,
  onClose,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [naturalSize, setNaturalSize] = useState(null);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    setNaturalSize(imageWidth && imageHeight ? { width: imageWidth, height: imageHeight } : null);
  }, [imageHeight, imageWidth, uri]);

  const imageRatio = naturalSize?.width && naturalSize?.height
    ? naturalSize.width / naturalSize.height
    : 16 / 9;
  const frame = useMemo(() => {
    const maxWidth = Math.max(1, screenWidth - 8);
    const maxHeight = Math.max(1, screenHeight - insets.top - insets.bottom - 8);
    const ratio = imageRatio > 0 ? imageRatio : 16 / 9;

    if (ratio >= maxWidth / maxHeight) {
      return { width: maxWidth, height: maxWidth / ratio };
    }
    return { width: maxHeight * ratio, height: maxHeight };
  }, [imageRatio, insets.bottom, insets.top, screenHeight, screenWidth]);

  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [cacheKey, uri, visible]);

  useEffect(() => {
    if (!visible) return;
    const currentScale = Math.max(1, scale.value);
    if (currentScale <= 1.001) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      return;
    }

    const bounds = getAnnouncementImageBounds(frame.width, frame.height, screenWidth, screenHeight, currentScale);
    const clamped = clampAnnouncementImageTranslation(translateX.value, translateY.value, bounds);
    translateX.value = withSpring(clamped.x);
    translateY.value = withSpring(clamped.y);
    savedTranslateX.value = clamped.x;
    savedTranslateY.value = clamped.y;
  }, [frame.height, frame.width, screenHeight, screenWidth, visible]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      const nextScale = Math.max(1, scale.value);
      if (nextScale <= 1.001) {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }

      const bounds = getAnnouncementImageBounds(frame.width, frame.height, screenWidth, screenHeight, nextScale);
      const clamped = clampAnnouncementImageTranslation(translateX.value, translateY.value, bounds);
      scale.value = nextScale;
      savedScale.value = nextScale;
      translateX.value = withSpring(clamped.x);
      translateY.value = withSpring(clamped.y);
      savedTranslateX.value = clamped.x;
      savedTranslateY.value = clamped.y;
    }), [frame.height, frame.width, screenHeight, screenWidth, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pan = useMemo(() => Gesture.Pan()
    .onUpdate((event) => {
      const bounds = getAnnouncementImageBounds(frame.width, frame.height, screenWidth, screenHeight, scale.value);
      const next = clampAnnouncementImageTranslation(
        savedTranslateX.value + event.translationX,
        savedTranslateY.value + event.translationY,
        bounds,
      );
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      const bounds = getAnnouncementImageBounds(frame.width, frame.height, screenWidth, screenHeight, scale.value);
      const next = clampAnnouncementImageTranslation(translateX.value, translateY.value, bounds);
      translateX.value = withSpring(next.x);
      translateY.value = withSpring(next.y);
      savedTranslateX.value = next.x;
      savedTranslateY.value = next.y;
    }), [frame.height, frame.width, screenHeight, screenWidth, scale, savedTranslateX, savedTranslateY, translateX, translateY]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      const nextScale = savedScale.value > 1.001 ? 1 : 2.5;
      scale.value = withSpring(nextScale);
      savedScale.value = nextScale;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }), [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan, doubleTap), [doubleTap, pan, pinch]);
  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!uri) return null;

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          <StatusBar hidden />

          <GestureDetector gesture={gesture}>
            <Reanimated.View
              style={[{ width: frame.width, height: frame.height }, imageAnimatedStyle]}
            >
              <AnnouncementImage
                uri={uri}
                fallbackUri={fallbackUri}
                alt={alt}
                resizeMode="contain"
                cacheKey={cacheKey}
                cachePolicy="default"
                onImageSize={({ width, height }) => setNaturalSize((current) => (
                  current?.width === width && current?.height === height ? current : { width, height }
                ))}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
          </GestureDetector>

          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="ปิดภาพข่าวสาร"
            activeOpacity={0.8}
            style={[styles.closeButton, { top: Math.max(insets.top, 18) }]}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
