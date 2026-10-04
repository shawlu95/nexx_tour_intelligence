// Warning bottom sheet from the mockup (deactivate, delete account, remove agent).
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from './ui';

export function WarningSheet({
  visible,
  title,
  copy,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  copy: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.sheetIcon}>
            <Text style={s.sheetIconText}>!</Text>
          </View>
          <Text style={s.sheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={s.sheetCopy}>{copy}</Text>
          {error ? <Text style={s.sheetError}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [s.sheetDanger, (pressed || busy) && { opacity: 0.85 }]}
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.sheetDangerText}>{confirmLabel}</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.sheetSecondary, pressed && { opacity: 0.7 }]}
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={s.sheetSecondaryText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheetError: { fontFamily, fontSize: 13, color: colors.bad, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,24,0.55)', justifyContent: 'flex-end' },
  sheet: {
    margin: 12,
    marginBottom: 28,
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 20,
    paddingTop: 24,
    gap: 12,
    alignItems: 'center',
  },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.badSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sheetIconText: { fontFamily, fontSize: 18, fontWeight: '800', color: colors.bad },
  sheetTitle: { fontFamily, fontSize: 21, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  sheetCopy: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center', paddingHorizontal: 12, marginBottom: 4 },
  sheetDanger: { alignSelf: 'stretch', backgroundColor: colors.bad, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  sheetDangerText: { fontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  sheetSecondary: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetSecondaryText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
});
