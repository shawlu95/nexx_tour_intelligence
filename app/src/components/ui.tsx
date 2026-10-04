// Small set of shared UI building blocks. Colors follow the NORA mockup.
import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useWorkspacePaused } from '../lib/sharingPreview';

// Design tokens from the mockup's :root (--ink, --muted, --blue, --blue-fill, …).
export const colors = {
  bg: '#F4F6FA', // --canvas
  surface: '#FFFFFF', // --paper
  sunk: '#E9ECF2', // count pills, inactive rank numbers
  ink: '#171A29', // --ink
  ink2: '#525E78', // body copy (reaction summaries)
  ink3: '#707786', // --muted
  line: '#D9DEE7', // --line
  accent: '#1768BC', // --blue
  accentDark: '#10549A', // --blue-dark, text on --blue-fill
  accentFill: 'rgba(33,150,255,0.28)', // --blue-fill: primary buttons
  accentSoft: 'rgba(33,150,255,0.08)', // --soft-blue
  good: '#18794E',
  goodSoft: '#E5F5EB',
  warn: '#956018',
  warnSoft: '#FFF1DC',
  bad: '#A43B47',
  badSoft: '#FFEBEE',
  stage: '#171C2C', // dark cards and the recording stage
  stageInk: '#EEF2FA',
  stage2: '#B9C0CE',
  stageLine: '#26324A',
};

/** The mockup's typeface. Embedded natively (expo-font plugin in app.json); fontWeight picks the face. */
export const fontFamily = 'DM Sans';

/**
 * Page container. `tab` is for tab-bar screens, which have no header: they pad
 * the top for the status bar and Dynamic Island, and leave the bottom to the tab bar.
 */
export function Screen({
  children,
  scroll = true,
  style,
  dark = false,
  tab = false,
  refreshControl,
  scrollEnabled = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  tab?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Turn off while something inside handles vertical drags. */
  scrollEnabled?: boolean;
}) {
  const bg = { backgroundColor: dark ? colors.stage : colors.bg };
  const edges: Edge[] = tab ? ['top', 'left', 'right'] : ['bottom', 'left', 'right'];
  return (
    <SafeAreaView style={[styles.flex, bg]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screen, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          scrollEnabled={scrollEnabled}
        >
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
    primary: { bg: colors.accentFill, fg: colors.accentDark, border: 'transparent' },
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

/** Top of a tab screen: the NORA wordmark and the "Private" badge, as in the mockup. */
export function TabHeader({ title }: { title?: string }) {
  const paused = useWorkspacePaused();
  return (
    <View style={styles.tabHeader}>
      <View style={styles.tabHeaderRow}>
        <Text style={styles.wordmark}>NORA</Text>
        <StatusPill label={paused ? 'Paused' : 'Private'} tone="good" />
      </View>
      {title ? <Title>{title}</Title> : null}
    </View>
  );
}

/** The mockup's small "‹ Back" link at the top of screens inside a tab. */
export function BackLink({ onPress = () => router.back() }: { onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={10} style={styles.back}>
      <SymbolView name="chevron.left" tintColor={colors.ink2} size={12} type="monochrome" />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
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
    minHeight: 48,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontFamily, fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  body: { fontFamily, fontSize: 16, lineHeight: 23, color: colors.ink2 },
  field: { gap: 6 },
  fieldLabel: { fontFamily, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily, fontSize: 16,
    color: colors.ink,
  },
  banner: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { fontFamily, fontSize: 14, lineHeight: 20 },
  tabHeader: { gap: 14 },
  tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily, fontSize: 16, fontWeight: '800', letterSpacing: 4, color: colors.ink },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9, alignSelf: 'flex-start' },
  pillText: { fontFamily, fontSize: 12, fontWeight: '600' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: { fontFamily, fontSize: 15, fontWeight: '600', color: colors.ink2 },
});
