// The mockup's dialog, used for every confirmation in the app: an icon tile, an
// optional eyebrow, a title and copy, then a primary button and a second choice.
// `layout="sheet"` floats at the bottom (Still recording?, Deactivate, Delete…);
// `layout="center"` is the centered card (Revisiting this home?).
import type { SFSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from './ui';

type Tone = 'primary' | 'danger';

export function DesignSheet({
  visible,
  layout = 'sheet',
  tone = 'primary',
  icon,
  iconText,
  eyebrow,
  title,
  copy,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  secondaryAsLink = false,
  busy = false,
  error,
  onDismiss,
}: {
  visible: boolean;
  layout?: 'sheet' | 'center';
  /** Light blue main button, or red for destructive choices. */
  tone?: Tone;
  icon?: SFSymbol;
  /** Text in the icon tile instead of a symbol ("!", "10"). */
  iconText?: string;
  eyebrow?: string;
  title: string;
  copy?: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** The second choice as a blue text link (centered card) instead of an outlined button. */
  secondaryAsLink?: boolean;
  busy?: boolean;
  error?: string;
  /** Swipe-down / back gesture. Defaults to the second choice. */
  onDismiss?: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss ?? onSecondary}>
      <View style={[s.backdrop, layout === 'center' && s.backdropCenter]}>
        <View style={[s.card, layout === 'center' && s.cardCenter]} accessibilityViewIsModal>
          <View style={[s.icon, danger ? s.iconDanger : s.iconPrimary]}>
            {iconText ? (
              <Text style={[s.iconText, { color: danger ? colors.bad : colors.accent }]}>{iconText}</Text>
            ) : icon ? (
              <SymbolView name={icon} tintColor={danger ? colors.bad : colors.accent} size={18} type="monochrome" />
            ) : null}
          </View>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          <Text style={s.title} accessibilityRole="header">
            {title}
          </Text>
          {copy ? <Text style={s.copy}>{copy}</Text> : null}
          {children}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={onPrimary}
            disabled={busy}
            style={({ pressed }) => [s.primary, danger ? s.primaryDanger : s.primaryBlue, (pressed || busy) && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={danger ? '#FFFFFF' : colors.accentDark} />
            ) : (
              <Text style={[s.primaryText, { color: danger ? '#FFFFFF' : colors.accentDark }]}>{primaryLabel}</Text>
            )}
          </Pressable>
          {secondaryAsLink ? (
            <Pressable accessibilityRole="button" onPress={onSecondary} disabled={busy} hitSlop={10} style={s.link}>
              <Text style={s.linkText}>{secondaryLabel}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onSecondary}
              disabled={busy}
              style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.secondaryText}>{secondaryLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,28,49,0.5)', justifyContent: 'flex-end' },
  backdropCenter: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: {
    margin: 12,
    marginBottom: 28,
    backgroundColor: colors.surface,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 10,
    alignItems: 'center',
  },
  cardCenter: { margin: 0, marginBottom: 0, width: '100%', maxWidth: 360, borderRadius: 22 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  iconPrimary: { backgroundColor: colors.accentSoft },
  iconDanger: { backgroundColor: colors.badSoft },
  iconText: { fontFamily, fontSize: 17, fontWeight: '800' },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  copy: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink2, textAlign: 'center', paddingHorizontal: 6, marginBottom: 4 },
  error: { fontFamily, fontSize: 13, color: colors.bad, textAlign: 'center' },
  primary: { alignSelf: 'stretch', minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBlue: { backgroundColor: colors.accentFill },
  primaryDanger: { backgroundColor: colors.bad },
  primaryText: { fontFamily, fontSize: 16, fontWeight: '700' },
  secondary: {
    alignSelf: 'stretch',
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent },
});
