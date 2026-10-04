// Ask NORA, from the mockup: one conversation about the buyer's whole home search
// (compare homes, spot patterns, decide what to ask the agent). Each turn is a
// rank-homes "chat" turn, which also keeps the buyer's priorities up to date for
// the next ranking.
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../../components/ui';
import { fetchRankingState, sendRankingTurn, type RankingMessage, type RankingState } from '../../lib/ranking';

const STARTERS = ['Compare my top homes', 'What do I keep liking?', 'What should I ask my agent?'];

/** NORA's reply, with its follow-up question (if any) as the last paragraph. */
function replyText(m: RankingMessage): string {
  const q = m.question?.trim();
  return q && !m.content.includes(q) ? `${m.content}\n\n${q}` : m.content;
}

export default function AskNora() {
  const [state, setState] = useState<RankingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  // The buyer's message, shown right away while NORA answers.
  const [sending, setSending] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchRankingState());
    } catch {
      setError("Couldn't load the conversation. Check your connection.");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    setSending(message);
    setDraft('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const result = await sendRankingTurn('chat', message);
      setState((s) => (s ? { ...s, messages: [...s.messages, ...result.messages], priorities: result.priorities } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "NORA couldn't answer just now. Try again.");
      setDraft((d) => d || message);
    }
    setSending(null);
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
  }

  // Ranking turns live in the same table; this screen shows only the conversation.
  const turns = (state?.messages ?? []).filter((m) => !(m.role === 'assistant' && m.ranking?.length));
  const empty = turns.length === 0 && !sending;
  const canSend = draft.trim().length > 0 && !busy;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back} hitSlop={6}>
          <SymbolView name="chevron.left" tintColor="#5F6B82" size={14} type="monochrome" />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.title} accessibilityRole="header">
            Ask NORA
          </Text>
          <Text style={s.subtitle}>Your home search, in one conversation.</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          style={s.flex}
          contentContainerStyle={[s.thread, empty && s.threadEmpty]}
          keyboardShouldPersistTaps="handled"
        >
          {empty ? (
            <View style={s.welcome}>
              <View style={s.mark}>
                <Text style={s.markText}>N</Text>
              </View>
              <Text style={s.welcomeTitle}>Let’s make sense of your homes.</Text>
              <Text style={s.welcomeCopy}>Compare your reactions, spot patterns, or decide what to ask your agent.</Text>
            </View>
          ) : (
            turns.map((m) =>
              m.role === 'user' ? (
                <View key={m.id} style={s.userBubble}>
                  <Text style={s.userText}>{m.content}</Text>
                </View>
              ) : (
                <Text key={m.id} style={s.reply} selectable>
                  {replyText(m)}
                </Text>
              ),
            )
          )}
          {sending ? (
            <>
              <View style={s.userBubble}>
                <Text style={s.userText}>{sending}</Text>
              </View>
              <View style={s.thinking} accessibilityLabel="NORA is thinking">
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            </>
          ) : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggestionsBar} contentContainerStyle={s.suggestions} keyboardShouldPersistTaps="handled">
          {STARTERS.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              onPress={() => void send(t)}
              disabled={busy}
              style={({ pressed }) => [s.suggestion, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.suggestionText}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.composer}>
          <TextInput
            accessibilityLabel="Message NORA"
            style={s.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask NORA anything about your search"
            placeholderTextColor="#8C95A6"
            multiline
            maxLength={2000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => void send(draft)}
            disabled={!canSend}
            style={[s.send, canSend && s.sendActive]}
          >
            <SymbolView name="arrow.up" tintColor={canSend ? colors.accentDark : '#9BA7BA'} size={15} type="monochrome" weight="bold" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 14, paddingHorizontal: 15, paddingBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E9EDF5', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, color: colors.ink },
  subtitle: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 4 },
  thread: { paddingTop: 22, paddingHorizontal: 17, paddingBottom: 20, gap: 20 },
  threadEmpty: { flexGrow: 1, justifyContent: 'center' },
  welcome: { alignItems: 'center', paddingHorizontal: 8, paddingBottom: 15 },
  mark: {
    width: 55,
    height: 55,
    borderRadius: 18,
    backgroundColor: '#E1EFFD', // the mockup's faint blue gradient, flattened
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 23,
    shadowColor: 'rgb(33,150,255)',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  markText: { fontFamily, fontSize: 22, fontWeight: '800', color: colors.accent },
  welcomeTitle: {
    fontFamily,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.9,
    color: colors.ink,
    textAlign: 'center',
    marginHorizontal: 40,
    marginBottom: 13,
  },
  welcomeCopy: { fontFamily, fontSize: 15, lineHeight: 24, color: '#788295', textAlign: 'center', marginHorizontal: 38 },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: '#E7EBF3',
    borderTopLeftRadius: 19,
    borderTopRightRadius: 19,
    borderBottomLeftRadius: 19,
    borderBottomRightRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 15,
  },
  userText: { fontFamily, fontSize: 15, lineHeight: 22.8, color: colors.ink },
  reply: { fontFamily, fontSize: 16, lineHeight: 26.4, color: '#303746' },
  thinking: { alignSelf: 'flex-start', paddingVertical: 4 },
  error: { fontFamily, fontSize: 15, color: colors.bad },
  suggestionsBar: { flexGrow: 0 },
  suggestions: { paddingTop: 7, paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  suggestion: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  suggestionText: { fontFamily, fontSize: 12, color: '#637087' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 19,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D2D9E6',
    paddingVertical: 9,
    paddingHorizontal: 10,
    shadowColor: 'rgb(22,32,64)',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
  },
  input: { flex: 1, maxHeight: 120, fontFamily, fontSize: 16, lineHeight: 23, color: colors.ink, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 3 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DFE5EF', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  sendActive: { backgroundColor: colors.accentFill },
});
