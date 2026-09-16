import React, { useEffect, useMemo } from "react";
import { Modal, StatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import AnnouncementImage from "./AnnouncementImage";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function AnnouncementImageViewer({
  visible,
  uri,
  alt,
  imageWidth,
  imageHeight,
  cacheKey,
  onClose,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const imageRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 16 / 9;
  const frame = useMemo(() => {
    const maxWidth = Math.max(1, screenWidth - 24);
    const maxHeight = Math.max(1, screenHeight - 112);
    const ratio = clamp(imageRatio, 0.35, 3.2);

    if (ratio >= maxWidth / maxHeight) {
      return { width: maxWidth, height: maxWidth / ratio };
    }
    return { width: maxHeight * ratio, height: maxHeight };
  }, [imageRatio, screenHeight, screenWidth]);

  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [cacheKey, uri, visible]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 1), 4);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    }), [scale, savedScale]);

  const pan = useMemo(() => Gesture.Pan()
    .onUpdate((event) => {
      const maxX = Math.max(0, (frame.width * scale.value - screenWidth) / 2);
      const maxY = Math.max(0, (frame.height * scale.value - screenHeight) / 2);
      translateX.value = Math.min(Math.max(savedTranslateX.value + event.translationX, -maxX), maxX);
      translateY.value = Math.min(Math.max(savedTranslateY.value + event.translationY, -maxY), maxY);
    })
    .onEnd(() => {
      const maxX = Math.max(0, (frame.width * scale.value - screenWidth) / 2);
      const maxY = Math.max(0, (frame.height * scale.value - screenHeight) / 2);
      const nextX = Math.min(Math.max(translateX.value, -maxX), maxX);
      const nextY = Math.min(Math.max(translateY.value, -maxY), maxY);
      translateX.value = withSpring(nextX);
      translateY.value = withSpring(nextY);
      savedTranslateX.value = nextX;
      savedTranslateY.value = nextY;
    }), [frame.height, frame.width, screenHeight, screenWidth, scale, savedTranslateX, savedTranslateY, translateX, translateY]);

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan), [pan, pinch]);
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
                alt={alt}
                resizeMode="contain"
                cacheKey={cacheKey}
                style={StyleSheet.absoluteFillObject}
              />
            </Reanimated.View>
          </GestureDetector>

          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="ปิดภาพข่าวสาร"
            activeOpacity={0.8}
            style={styles.closeButton}
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
    top: 18,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
