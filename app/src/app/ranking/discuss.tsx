import { router, useFocusEffect } from 'expo-router';
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
import { Banner, Body, Button, colors, Eyebrow } from '../../components/ui';
import {
  discussedSinceRanking,
  fetchRankingState,
  resetRanking,
  sendRankingTurn,
  type Importance,
  type RankingMessage,
  type RankingState,
} from '../../lib/ranking';

const STARTERS = ['Why is #1 on top?', 'Compare my top two', 'What should I ask my agent?'];

const IMPORTANCE: Record<Importance, { label: string; color: string }> = {
  must: { label: 'must have', color: colors.bad },
  high: { label: 'important', color: colors.accent },
  medium: { label: 'nice to have', color: colors.ink3 },
  low: { label: 'minor', color: colors.line },
};

export default function Discuss() {
  const [state, setState] = useState<RankingState | null>(null);
  const [busy, setBusy] = useState<'chat' | 'rank' | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
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

  async function chat(text: string) {
    const message = text.trim();
    if (!message) return;
    setBusy('chat');
    setError('');
    try {
      const result = await sendRankingTurn('chat', message);
      setState((s) => (s ? { ...s, messages: [...s.messages, ...result.messages], priorities: result.priorities } : s));
      setDraft('');
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : "NORA couldn't answer just now. Try again.");
    }
    setBusy(null);
  }

  async function updateRanking() {
    setBusy('rank');
    setError('');
    try {
      await sendRankingTurn('rank');
      router.back(); // the Ranking tab reloads and shows the new order
    } catch (e) {
      setError(e instanceof Error ? e.message : "NORA couldn't re-rank just now. Try again.");
      setBusy(null);
    }
  }

  const messages = state?.messages ?? [];
  const chatTurns = messages.filter((m) => !(m.role === 'assistant' && m.ranking?.length));
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.ranking?.length);
  const canUpdate = discussedSinceRanking(messages);
  const offline = state?.offline ?? false;

  return (
    <SafeAreaView style={s.root} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {state && state.priorities.length > 0 ? (
            <View style={s.section}>
              <Eyebrow color={colors.ink3}>What matters to you</Eyebrow>
              <View style={s.chips}>
                {state.priorities.map((p) => (
                  <View key={p.label} style={s.chip} accessible accessibilityLabel={`${p.label}, ${IMPORTANCE[p.importance].label}`}>
                    <View style={[s.dot, { backgroundColor: IMPORTANCE[p.importance].color }]} />
                    <Text style={s.chipText}>{p.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.legend}>
                <Text style={{ color: IMPORTANCE.must.color }}>●</Text> must have{'   '}
                <Text style={{ color: IMPORTANCE.high.color }}>●</Text> important{'   '}
                <Text style={{ color: IMPORTANCE.medium.color }}>●</Text> nice to have
              </Text>
            </View>
          ) : null}

          {!state ? <ActivityIndicator color={colors.accent} /> : null}

          <View style={s.thread}>
            <View style={[s.bubble, s.bubbleNora]}>
              <Text style={s.bubbleText}>
                Tell me what matters to you, or ask why a home ranks where it does. When you&apos;re done, tap Update ranking.
              </Text>
            </View>
            {chatTurns.length === 0 && state ? (
              <View style={s.replies}>
                {STARTERS.map((t) => (
                  <Reply key={t} text={t} onPress={() => chat(t)} disabled={!!busy || offline} />
                ))}
              </View>
            ) : null}

            {messages.map((m) =>
              m.role === 'assistant' && m.ranking?.length ? (
                <Text key={m.id} style={s.marker}>
                  Ranking updated{m.content ? ` · ${m.content}` : ''}
                </Text>
              ) : (
                <Bubble
                  key={m.id}
                  message={m}
                  onPick={m.id === lastAssistant?.id && !busy && !offline ? chat : undefined}
                />
              ),
            )}

            {busy === 'chat' ? (
              <View style={[s.bubble, s.bubbleNora, s.typing]}>
                <ActivityIndicator size="small" color={colors.ink3} />
                <Text style={s.typingText}>NORA is thinking…</Text>
              </View>
            ) : null}
          </View>

          {error ? <Banner tone="error">{error}</Banner> : null}

          <View style={s.footer}>
            {confirmReset ? (
              <View style={s.confirm}>
                <Body>Start over? NORA forgets this conversation and what it learned about you, then ranks your homes fresh.</Body>
                <View style={s.row}>
                  <Button kind="secondary" title="Cancel" onPress={() => setConfirmReset(false)} style={s.flex} />
                  <Button
                    kind="danger"
                    title="Start over"
                    style={s.flex}
                    onPress={async () => {
                      setConfirmReset(false);
                      try {
                        await resetRanking();
                        router.back(); // the Ranking tab ranks again from scratch
                      } catch {
                        setError("Couldn't start over. Check your connection.");
                      }
                    }}
                  />
                </View>
              </View>
            ) : (
              <Button kind="ghost" title="Start over" onPress={() => setConfirmReset(true)} />
            )}
          </View>
        </ScrollView>

        <View style={s.bottom}>
          {canUpdate ? (
            <Button
              title="Update ranking"
              onPress={updateRanking}
              loading={busy === 'rank'}
              disabled={!!busy || offline}
              accessibilityLabel="Update the ranking with what we discussed"
            />
          ) : null}
          <View style={s.composer}>
            <TextInput
              accessibilityLabel="Message to NORA"
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={lastAssistant?.question ? 'Answer, or ask NORA anything' : 'Ask why, or tell NORA what matters'}
              placeholderTextColor={colors.ink3}
              multiline
              maxLength={2000}
              editable={!busy && !offline}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!draft.trim() || !!busy || offline}
              onPress={() => chat(draft)}
              style={[s.send, (!draft.trim() || !!busy || offline) && { opacity: 0.4 }]}
            >
              <Text style={s.sendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Reply({ text, onPress, disabled }: { text: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Sends this as your message"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.reply, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={s.replyText}>{text}</Text>
    </Pressable>
  );
}

function Bubble({ message, onPick }: { message: RankingMessage; onPick?: (text: string) => void }) {
  const mine = message.role === 'user';
  const suggestions = message.suggestions ?? [];
  const questionTappable = !!onPick && !!message.question && suggestions.length === 0;
  return (
    <View style={s.turn}>
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleNora]}>
        <Text style={[s.bubbleText, mine && { color: '#FFFFFF' }]}>{message.content}</Text>
        {!mine && message.question ? (
          questionTappable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Sends this as your message"
              onPress={() => onPick!(message.question!)}
              style={({ pressed }) => [s.questionTap, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.question}>{message.question}</Text>
            </Pressable>
          ) : (
            <Text style={s.question}>{message.question}</Text>
          )
        ) : null}
      </View>
      {!mine && onPick && suggestions.length > 0 ? (
        <View style={s.replies}>
          {suggestions.map((t) => (
            <Reply key={t} text={t} onPress={() => onPick(t)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 24 },
  section: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  legend: { fontSize: 12, color: colors.ink3 },
  thread: { gap: 12 },
  turn: { gap: 8 },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 15, gap: 8 },
  bubbleNora: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  question: { fontSize: 15, lineHeight: 22, color: colors.accent, fontWeight: '600' },
  questionTap: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginHorizontal: -10, backgroundColor: colors.accentSoft },
  replies: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 4 },
  reply: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  replyText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  marker: { alignSelf: 'center', fontSize: 12, color: colors.ink3, textAlign: 'center', paddingHorizontal: 20 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 14, color: colors.ink3 },
  footer: { alignItems: 'center' },
  confirm: { gap: 10, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 10 },
  bottom: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 15,
    color: colors.ink,
  },
  send: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: colors.accent, justifyContent: 'center' },
  sendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
