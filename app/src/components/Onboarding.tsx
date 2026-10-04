// Shared pieces of the mockup's sign-in and onboarding screens: the soft blue
// glow on a white-to-grey gradient, the "NORA·" wordmark in Manrope, and the
// rise-in animations.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './ui';

/** Manrope ExtraBold, loaded at startup (app/_layout.tsx) for headlines and the wordmark. */
export const brandFont = 'Manrope_800ExtraBold';

/** The mockup's cubic-bezier(0.2, 0.74, 0.23, 1). */
export const easeOut = Easing.bezier(0.2, 0.74, 0.23, 1);

/** Full-screen frame with the glow centred at `glowY` (a fraction of the height). */
export function OnboardingScreen({ children, glowY = 0.37 }: { children: ReactNode; glowY?: number }) {
  return (
    <SafeAreaView
      style={[
        s.root,
        {
          experimental_backgroundImage: `radial-gradient(circle at 50% ${Math.round(glowY * 100)}%, rgba(33,150,255,0.12), transparent 29%), linear-gradient(180deg, rgb(252,253,255), rgb(243,246,251))`,
        },
      ]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <Text style={s.brand} accessibilityRole="header" accessibilityLabel="NORA">
        NORA<Text style={s.dot}>·</Text>
      </Text>
      {children}
    </SafeAreaView>
  );
}

/** Fades and rises in after `delay` ms (the mockup's provider-rise / slogan-reveal). */
export function RiseIn({
  delay,
  distance = 12,
  duration = 460,
  style,
  children,
}: {
  delay: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, delay, easing: easeOut, useNativeDriver: true }).start();
  }, [t, delay, duration]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** The mockup's ready-pop: scales up from 0.72 with a little overshoot. */
export function PopIn({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 480,
      delay: 100,
      easing: Easing.bezier(0.17, 0.89, 0.32, 1.35),
      useNativeDriver: true,
    }).start();
  }, [t]);
  return (
    <Animated.View
      style={[style, { opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** The mockup's --blue-gradient tile (check mark on Ready, location pin on setup). */
export function GradientTile({ size, radius, children }: { size: number; radius: number; children: ReactNode }) {
  return (
    <View
      style={[
        s.tile,
        {
          width: size,
          height: size,
          borderRadius: radius,
          experimental_backgroundImage: 'linear-gradient(145deg, rgba(33,150,255,0.38), rgba(76,185,255,0.24))',
        },
      ]}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FC', paddingHorizontal: 25, paddingTop: 12, paddingBottom: 12 },
  brand: { fontFamily: brandFont, fontSize: 19.5, letterSpacing: 3.3, color: colors.ink },
  dot: { color: colors.accent },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgb(33,150,255)',
    shadowOpacity: 0.25,
    shadowRadius: 19,
    shadowOffset: { width: 0, height: 18 },
  },
});
