export const getAnnouncementImageBounds = (imageWidth, imageHeight, screenWidth, screenHeight, scale) => {
  "worklet";
  return {
    maxX: Math.max(0, (imageWidth * scale - screenWidth) / 2),
    maxY: Math.max(0, (imageHeight * scale - screenHeight) / 2),
  };
};

export const clampAnnouncementImageTranslation = (x, y, bounds) => {
  "worklet";
  return {
    x: Math.min(Math.max(x, -bounds.maxX), bounds.maxX),
    y: Math.min(Math.max(y, -bounds.maxY), bounds.maxY),
  };
};
