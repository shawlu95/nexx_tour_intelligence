// Small set of shared UI building blocks. Colors follow the NORA mockup.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#F4F6F9',
  surface: '#FFFFFF',
  sunk: '#E9EDF3',
  ink: '#18202E',
  ink2: '#4A5568',
  ink3: '#7A8496',
  line: '#D8DEE8',
  accent: '#2E5BE6',
  accentSoft: '#E3EAFD',
  good: '#1E7A4C',
  goodSoft: '#E1F3E9',
  warn: '#A8620B',
  warnSoft: '#FBEEDB',
  bad: '#B23A3A',
  badSoft: '#F8E3E3',
  stage: '#121A2B',
  stageInk: '#EEF2FA',
  stage2: '#9AA7C2',
  stageLine: '#26324A',
};

export function Screen({
  children,
  scroll = true,
  style,
  dark = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  const bg = { backgroundColor: dark ? colors.stage : colors.bg };
  return (
    <SafeAreaView style={[styles.flex, bg]} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.screen, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.screen, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: '#FFFFFF', border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.line },
    danger: { bg: colors.bad, fg: '#FFFFFF', border: colors.bad },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Eyebrow({ children, color = colors.accent }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, muted && { color: colors.ink3 }, style]}>{children}</Text>;
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.ink3}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) {
  const t = {
    info: { bg: colors.accentSoft, fg: colors.accent },
    error: { bg: colors.badSoft, fg: colors.bad },
    success: { bg: colors.goodSoft, fg: colors.good },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.bannerText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const t = {
    good: { bg: colors.goodSoft, fg: colors.good },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    bad: { bg: colors.badSoft, fg: colors.bad },
    neutral: { bg: colors.sunk, fg: colors.ink2 },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.flex, styles.center]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  screen: { padding: 20, gap: 16, flexGrow: 1 },
  button: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink2 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  banner: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
});
