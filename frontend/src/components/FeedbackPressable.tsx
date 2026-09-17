import { Pressable as NativePressable, StyleSheet, type PressableProps } from "react-native";
import { useTheme } from "@/src/theme";

export function Pressable({ style, android_ripple, ...props }: PressableProps) {
  const { colors } = useTheme();
  return (
    <NativePressable {...props} android_ripple={android_ripple ?? { color: colors.brandTertiary }} style={(state) => [typeof style === "function" ? style(state) : style, state.pressed && !props.disabled ? styles.pressed : null]} />
  );
}
const styles = StyleSheet.create({ pressed: { opacity: 0.58, transform: [{ scale: 0.985 }] } });
