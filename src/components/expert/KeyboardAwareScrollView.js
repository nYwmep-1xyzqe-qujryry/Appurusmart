import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { findNodeHandle, Platform, ScrollView } from "react-native";

const KeyboardAwareScrollView = forwardRef(
  (
    {
      onFocusCapture,
      keyboardOffset = 160,
      scrollOnFocus = Platform.OS === "ios",
      ...props
    },
    forwardedRef,
  ) => {
    const scrollRef = useRef(null);

    useImperativeHandle(forwardedRef, () => scrollRef.current);

    const handleFocusCapture = (event) => {
      onFocusCapture?.(event);
      if (!scrollOnFocus) return;

      const target = event.nativeEvent?.target;
      const nodeHandle =
        typeof target === "number" ? target : findNodeHandle(target);
      if (!nodeHandle) return;

      requestAnimationFrame(() => {
        setTimeout(() => {
          const responder = scrollRef.current?.getScrollResponder?.();
          responder?.scrollResponderScrollNativeHandleToKeyboard?.(
            nodeHandle,
            keyboardOffset,
            true,
          );
        }, 80);
      });
    };

    return (
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets={false}
        onFocusCapture={handleFocusCapture}
        {...props}
      />
    );
  },
);

KeyboardAwareScrollView.displayName = "KeyboardAwareScrollView";

export default KeyboardAwareScrollView;
