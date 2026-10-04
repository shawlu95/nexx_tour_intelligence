// Type instead, from the mockup: the buyer writes their reaction rather than
// recording it (also the way forward when the microphone is off). The text is
// organized exactly like a transcript; nothing goes to the transcription service.
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { AiConsentSheet } from '../../../components/AiConsentSheet';
import { BackLink, Button, colors, fontFamily, Screen, TabHeader } from '../../../components/ui';
import type { AddressDraft } from '../../../lib/address';
import { useUserId } from '../../../lib/auth';
import { loadAiConsent } from '../../../lib/consent';
import { addPending } from '../../../lib/localdb';
import { runQueue } from '../../../lib/sync';

const MIN_CHARS = 15;
const MAX_CHARS = 5000; // matches the visits.typed_note check

export default function TypeNote() {
  const userId = useUserId();
  const params = useLocalSearchParams<{ propertyId?: string; draft?: string; label?: string }>();
  const draft = params.draft ? (JSON.parse(params.draft) as AddressDraft) : null;
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const ready = text.trim().length >= MIN_CHARS;

  async function save() {
    setSaving(true);
    const visitId = Crypto.randomUUID();
    await addPending({
      id: visitId,
      user_id: userId,
      property_id: params.propertyId ?? null,
      property_draft: params.propertyId ? null : draft,
      address_label: params.label ?? draft?.addressLine ?? 'New home',
      recorded_at: new Date().toISOString(),
      duration_seconds: 0,
      file_uri: '',
      typed_text: text.trim(),
    });
    void runQueue({ force: true });
    router.dismissTo('/tour');
    router.push(`/visit/${visitId}`);
  }

  async function organize() {
    // Ask for AI permission first if it's off; the note is saved either way.
    const on = await loadAiConsent().catch(() => null);
    if (on === false) return setAskConsent(true);
    await save();
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tab style={s.screen}>
        <TabHeader />
        <BackLink />

        <View style={s.heading}>
          <Text style={s.eyebrow}>TYPE INSTEAD</Text>
          <Text style={s.title} accessibilityRole="header">
            What stood out?
          </Text>
          <Text style={s.body}>Write your reaction in your own words. NORA will organize it when you continue.</Text>
          {params.label ? <Text style={s.place}>{params.label}</Text> : null}
        </View>

        <View style={s.field}>
          <Text style={s.label}>Your impression</Text>
          <TextInput
            accessibilityLabel="Your impression"
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Example: Great kitchen and sunlight. The backyard felt small, and I’m concerned about the power lines."
            placeholderTextColor={colors.ink3}
            maxLength={MAX_CHARS}
            multiline
            autoFocus
          />
        </View>

        <Button title="Organize this note" onPress={() => void organize()} disabled={!ready} loading={saving} />
        <Text style={s.hint}>{ready ? 'Your note stays private from agents until you share it.' : 'Write a sentence or two to continue.'}</Text>
      </Screen>
      <AiConsentSheet
        visible={askConsent}
        onDone={() => {
          setAskConsent(false);
          void save();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 16 },
  heading: { gap: 8, marginTop: 4 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  body: { fontFamily, fontSize: 15, lineHeight: 22, color: colors.ink2 },
  place: { fontFamily, fontSize: 14, fontWeight: '700', color: colors.ink },
  field: { gap: 8 },
  label: { fontFamily, fontSize: 13, fontWeight: '600', color: colors.ink2 },
  input: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
    fontFamily, fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  hint: { fontFamily, fontSize: 13, color: colors.ink3, textAlign: 'center' },
});
