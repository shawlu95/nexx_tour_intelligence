// Edit reaction, from the updated mockup: the buyer rewrites their reaction in their
// own words, and NORA updates the Liked / Concerns bubbles below as they type
// (a preview a moment after they stop). Save changes stores both.
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, fontFamily, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { editReaction, fetchVisit } from '../../lib/api';

type Bubble = { kind: 'liked' | 'concern' | 'question'; text: string };

const PREVIEW_AFTER_MS = 1200;

export default function EditReaction() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [address, setAddress] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    fetchVisit(visitId)
      .then(({ data }) => {
        if (!data?.note) return;
        setAddress(displayAddress(data.property));
        setOriginal(data.note.overall);
        setText(data.note.overall);
        setBubbles(data.items.map((i) => ({ kind: i.kind, text: i.text })));
      })
      .catch(() => setError("Couldn't load this note. Check your connection."));
  }, [visitId]);

  // A moment after typing stops, ask NORA how it reads the new words.
  useEffect(() => {
    if (original === null || text.trim() === original.trim() || text.trim().length < 3) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const items = await editReaction(visitId, text);
        if (ticket === latest.current) {
          setBubbles(items);
          setError('');
        }
      } catch (e) {
        if (ticket === latest.current) setError(e instanceof Error ? e.message : "NORA couldn't read that just now.");
      }
      if (ticket === latest.current) setPreviewing(false);
    }, PREVIEW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, original, visitId]);

  const changed = original !== null && text.trim() !== original.trim() && text.trim().length >= 3;
  const liked = bubbles.filter((b) => b.kind === 'liked');
  const concerns = bubbles.filter((b) => b.kind === 'concern');

  async function save() {
    setSaving(true);
    setError('');
    try {
      await editReaction(visitId, text, true);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your changes. Try again.");
    }
    setSaving(false);
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.top}>
        <TabHeader />
      </View>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={s.cancel}>
          <SymbolView name="chevron.left" tintColor={colors.ink2} size={12} type="monochrome" />
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={s.headerLabel}>EDIT REACTION</Text>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.title} accessibilityRole="header">
            Your words. Your reaction.
          </Text>
          <Text style={s.address}>{address}</Text>

          <Text style={s.fieldLabel}>Summary</Text>
          <TextInput
            accessibilityLabel="Summary"
            accessibilityHint="Edit your words. NORA updates the bubbles below."
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="What did you like? What concerned you?"
            placeholderTextColor="#8C95A6"
            maxLength={5000}
            multiline
          />
          <Text style={s.help}>Edit your words. NORA updates the bubbles below.</Text>

          <View style={s.labelRow}>
            <Text style={[s.label, { color: colors.good }]}>LIKED</Text>
            {previewing ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          </View>
          <View style={s.chips}>
            {liked.length ? (
              liked.map((b) => (
                <Text key={b.text} style={[s.chip, s.chipGood]}>
                  {b.text}
                </Text>
              ))
            ) : (
              <Text style={s.none}>Nothing yet</Text>
            )}
          </View>
          <Text style={[s.label, { color: colors.bad }]}>CONCERNS</Text>
          <View style={s.chips}>
            {concerns.length ? (
              concerns.map((b) => (
                <Text key={b.text} style={[s.chip, s.chipBad]}>
                  {b.text}
                </Text>
              ))
            ) : (
              <Text style={s.none}>Nothing yet</Text>
            )}
          </View>
          <Text style={s.note}>Review NORA’s interpretation before saving.</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
        </ScrollView>
        <View style={s.footer}>
          <Button title="Save changes" onPress={() => void save()} disabled={!changed || previewing} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  top: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  cancelText: { fontFamily, fontSize: 14, fontWeight: '700', color: colors.ink2 },
  headerLabel: { fontFamily, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: '#8C95A6' },
  body: { padding: 18, paddingBottom: 30 },
  title: { fontFamily, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: colors.ink },
  address: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 6 },
  fieldLabel: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink2, marginTop: 24, marginBottom: 8 },
  input: {
    minHeight: 170,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#CFD5DF',
    borderRadius: 14,
    padding: 14,
    fontFamily,
    fontSize: 15,
    lineHeight: 23,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  help: { fontFamily, fontSize: 12.5, color: colors.ink3, marginTop: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily, fontSize: 11.2, fontWeight: '700', letterSpacing: 1.12, marginTop: 20, marginBottom: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { fontFamily, fontSize: 12.5, fontWeight: '600', borderRadius: 12, overflow: 'hidden', paddingVertical: 7, paddingHorizontal: 10 },
  chipGood: { backgroundColor: colors.goodSoft, color: colors.good },
  chipBad: { backgroundColor: colors.badSoft, color: colors.bad },
  none: { fontFamily, fontSize: 12.5, color: colors.ink3 },
  note: { fontFamily, fontSize: 11.5, color: '#949DAD', marginTop: 20 },
  error: { fontFamily, fontSize: 13, color: colors.bad, marginTop: 10 },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
});
