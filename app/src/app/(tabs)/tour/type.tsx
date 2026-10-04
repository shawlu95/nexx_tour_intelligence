// Type instead, from the mockup: the buyer writes their reaction rather than
// recording it (also the way forward when the microphone is off). The text is
// organized exactly like a transcript; nothing goes to the transcription service.
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AiConsentSheet } from '../../../components/AiConsentSheet';
import { colors, fontFamily, TabHeader } from '../../../components/ui';
import type { AddressDraft } from '../../../lib/address';
import { useUserId } from '../../../lib/auth';
import { loadAiConsent } from '../../../lib/consent';
import { addPending } from '../../../lib/localdb';
import { runQueue } from '../../../lib/sync';

const MIN_CHARS = 15;
const MAX_CHARS = 5000; // matches the visits.typed_note check

export default function TypeNote() {
  const userId = useUserId();
  const params = useLocalSearchParams<{ propertyId?: string; draft?: string; label?: string; place?: string }>();
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
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TabHeader />
      </View>
      <KeyboardAvoidingView style={s.stage} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.stageContent} keyboardShouldPersistTaps="handled">
          <View style={s.topRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.backButton} hitSlop={8}>
              <SymbolView name="chevron.left" tintColor="#FFFFFF" size={14} type="monochrome" />
            </Pressable>
            <View style={s.placeBox}>
              <Text style={s.placeTitle} numberOfLines={1}>
                {params.label}
              </Text>
              <Text style={s.placeSub}>{`${params.place || 'Address entered'} · address confirmed`}</Text>
            </View>
            <View style={s.backSpacer} />
          </View>

          <Text style={s.eyebrow}>TYPE INSTEAD</Text>
          <Text style={s.title} accessibilityRole="header">
            What stood out?
          </Text>
          <Text style={s.body}>Write your reaction in your own words. NORA will organize it when you continue.</Text>

          <Text style={s.label}>Your impression</Text>
          <TextInput
            accessibilityLabel="Your impression"
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Example: Great kitchen and sunlight. The backyard felt small, and I’m concerned about the power lines."
            placeholderTextColor="#7E879A"
            maxLength={MAX_CHARS}
            multiline
            autoFocus
          />

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || saving }}
            onPress={() => void organize()}
            disabled={!ready || saving}
            style={({ pressed }) => [s.organize, (!ready || pressed) && { opacity: ready ? 0.85 : 0.5 }]}
          >
            {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={s.organizeText}>Organize this note</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <AiConsentSheet
        visible={askConsent}
        onDone={() => {
          setAskConsent(false);
          void save();
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: colors.surface },
  stage: { flex: 1, backgroundColor: colors.stage },
  stageContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 30 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backSpacer: { width: 36 },
  placeBox: { flex: 1, alignItems: 'center', gap: 2 },
  placeTitle: { fontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  placeSub: { fontFamily, fontSize: 13, color: colors.stage2 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.56, color: '#91A8FA' },
  title: { fontFamily, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: '#FFFFFF', marginTop: 8 },
  body: { fontFamily, fontSize: 14, lineHeight: 21, color: colors.stage2, marginTop: 8 },
  label: { fontFamily, fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginTop: 26, marginBottom: 8 },
  input: {
    minHeight: 150,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: '#4C8DF0',
    borderRadius: 14,
    padding: 14,
    fontFamily,
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
    textAlignVertical: 'top',
  },
  organize: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizeText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
});
