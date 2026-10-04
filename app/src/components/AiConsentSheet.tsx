// "Let NORA organize it?" from the mockup: asked before a note is sent to the AI
// providers while AI processing is off. "Not now" still saves the note; it waits
// until the buyer allows processing.
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { setAiConsent } from '../lib/consent';
import { LegalModal } from './Legal';
import { colors } from './ui';

export const AI_CONSENT_COPY =
  'NORA sends your note and the confirmed property address to its AI providers (AssemblyAI to transcribe, Anthropic to summarize and rank). Original audio is deleted after transcription.';

export function AiConsentSheet({
  visible,
  onDone,
}: {
  visible: boolean;
  /** Called after the buyer chooses; `allowed` says which. */
  onDone: (allowed: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState(false);

  async function allow() {
    setBusy(true);
    setError('');
    try {
      await setAiConsent(true);
      onDone(true);
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onDone(false)}>
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.icon}>
            <Text style={s.iconText}>N</Text>
          </View>
          <Text style={s.eyebrow}>BEFORE YOUR FIRST NOTE</Text>
          <Text style={s.title} accessibilityRole="header">
            Let NORA organize it?
          </Text>
          <Text style={s.copy}>{AI_CONSENT_COPY}</Text>
          <Text style={s.small}>You can turn this off any time in Profile → Privacy & data.</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [s.primary, (pressed || busy) && { opacity: 0.85 }]}
            onPress={allow}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Allow AI processing</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
            onPress={() => onDone(false)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={s.secondaryText}>Not now</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => setPolicy(true)} hitSlop={8}>
            <Text style={s.link}>Read Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
      <LegalModal doc={policy ? 'privacy' : null} onClose={() => setPolicy(false)} />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,24,0.55)', justifyContent: 'flex-end' },
  sheet: {
    margin: 12,
    marginBottom: 28,
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 20,
    paddingTop: 24,
    gap: 10,
    alignItems: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconText: { fontSize: 20, fontWeight: '800', color: colors.accent },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  copy: { fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center', paddingHorizontal: 8 },
  small: { fontSize: 12, lineHeight: 17, color: colors.ink3, textAlign: 'center' },
  error: { fontSize: 13, color: colors.bad, textAlign: 'center' },
  primary: {
    alignSelf: 'stretch',
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  secondary: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  link: { fontSize: 14, fontWeight: '600', color: colors.accent, textDecorationLine: 'underline', marginTop: 4 },
});
