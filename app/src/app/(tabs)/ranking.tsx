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
import { HomeThumb } from '../../components/HomeThumb';
import { Banner, Body, Button, colors, Eyebrow, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import type { PropertyCard } from '../../lib/api';
import { formatHomeLine } from '../../lib/format';
import {
  fetchRankingState,
  latestRanking,
  newHomesSince,
  resetRanking,
  sendRankingTurn,
  type Fit,
  type Importance,
  type RankedHome,
  type RankingMessage,
  type RankingState,
} from '../../lib/ranking';

const SHOW_REASON_FOR_TOP = 3;

export default function Ranking() {
  const [state, setState] = useState<RankingState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const started = useRef(false);

  const send = useCallback(async (action: 'start' | 'send' | 'refresh', message?: string) => {
    setThinking(true);
    setError('');
    try {
      const result = await sendRankingTurn(action, message);
      setState((s) => (s ? { ...s, messages: [...s.messages, ...result.messages], priorities: result.priorities } : s));
      if (action === 'send') setDraft('');
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : "NORA couldn't answer just now. Try again.");
    }
    setThinking(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await fetchRankingState();
      setState(s);
      setLoadError('');
      // First visit to the tab with enough homes: ask for the first ranking.
      if (!started.current && !s.offline && s.messages.length === 0 && s.rankableIds.length >= 2) {
        started.current = true;
        void send('start');
      }
    } catch {
      setLoadError("Couldn't load your ranking. Check your connection.");
    }
  }, [send]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const latest = state ? latestRanking(state.messages) : null;
  const fresh = state && latest ? newHomesSince(latest, state.rankableIds) : [];
  const enoughHomes = (state?.rankableIds.length ?? 0) >= 2;
  const lastAssistant = state ? [...state.messages].reverse().find((m) => m.role === 'assistant') : undefined;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TabHeader title="Your ranking" />

          {loadError ? <Banner tone="error">{loadError}</Banner> : null}
          {state?.offline ? <Banner>{"You're offline. Showing your last ranking."}</Banner> : null}

          {!state && !loadError ? <ActivityIndicator color={colors.accent} /> : null}

          {state && !enoughHomes ? (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Tour a couple of homes first</Text>
              <Body muted>
                Record your reaction to at least two homes. NORA will rank them from your notes and the home facts, then
                ask what matters most to you.
              </Body>
              <Button title="Record a home" onPress={() => router.push('/record/pick')} />
            </View>
          ) : null}

          {state && enoughHomes && !latest && thinking ? (
            <View style={s.thinkingCard}>
              <ActivityIndicator color={colors.accent} />
              <Text style={s.thinkingText}>NORA is reading your notes and ranking your homes…</Text>
            </View>
          ) : null}

          {state && latest ? (
            <>
              {fresh.length > 0 ? (
                <View style={s.freshCard}>
                  <Text style={s.freshText}>
                    {fresh.length === 1 ? "You've recorded 1 new home" : `You've recorded ${fresh.length} new homes`} since
                    this ranking.
                  </Text>
                  <Button title="Update ranking" onPress={() => send('refresh')} loading={thinking} />
                </View>
              ) : null}

              <View style={s.list}>
                {latest.ranking!.map((r) => (
                  <RankRow key={r.property_id} item={r} home={state.homes.get(r.property_id)} />
                ))}
              </View>

              {state.priorities.length > 0 ? (
                <View style={s.section}>
                  <Eyebrow color={colors.ink3}>What matters to you</Eyebrow>
                  <View style={s.chips}>
                    {state.priorities.map((p) => (
                      <View key={p.label} style={s.chip} accessible accessibilityLabel={`${p.label}, ${IMPORTANCE_LABEL[p.importance]}`}>
                        <View style={[s.dot, { backgroundColor: IMPORTANCE_COLOR[p.importance] }]} />
                        <Text style={s.chipText}>{p.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.legend}>
                    <Text style={{ color: IMPORTANCE_COLOR.must }}>●</Text> must have{'   '}
                    <Text style={{ color: IMPORTANCE_COLOR.high }}>●</Text> important{'   '}
                    <Text style={{ color: IMPORTANCE_COLOR.medium }}>●</Text> nice to have
                  </Text>
                </View>
              ) : null}

              <View style={s.section}>
                <Eyebrow color={colors.ink3}>Talk it through</Eyebrow>
                {state.messages.map((m) => (
                  <Bubble
                    key={m.id}
                    message={m}
                    // Only the latest question can be answered with a tap.
                    onPick={m.id === lastAssistant?.id && !thinking && !state.offline ? (text) => send('send', text) : undefined}
                  />
                ))}
                {thinking ? (
                  <View style={[s.bubble, s.bubbleNora, s.typing]}>
                    <ActivityIndicator size="small" color={colors.ink3} />
                    <Text style={s.typingText}>NORA is thinking…</Text>
                  </View>
                ) : null}
              </View>

              <View style={s.footer}>
                {confirmReset ? (
                  <View style={s.confirm}>
                    <Body>Start over? NORA forgets this conversation and what it learned about you.</Body>
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
                            setState((st) => (st ? { ...st, messages: [], priorities: [] } : st));
                            void send('start');
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
            </>
          ) : null}

          {error ? <Banner tone="error">{error}</Banner> : null}
        </ScrollView>

        {state && enoughHomes && latest ? (
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => draft.trim() && send('send', draft.trim())}
            disabled={thinking || state.offline}
            placeholder={lastAssistant?.question ? 'Answer, or tell NORA what matters' : 'Tell NORA what matters to you'}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const FIT_LABEL: Record<Fit, string> = { strong: 'Strong fit', good: 'Good fit', weak: 'Weak fit' };
const FIT_TONE: Record<Fit, { bg: string; fg: string }> = {
  strong: { bg: colors.goodSoft, fg: colors.good },
  good: { bg: colors.accentSoft, fg: colors.accent },
  weak: { bg: colors.sunk, fg: colors.ink2 },
};
const IMPORTANCE_LABEL: Record<Importance, string> = {
  must: 'must have',
  high: 'important',
  medium: 'nice to have',
  low: 'minor',
};
const IMPORTANCE_COLOR: Record<Importance, string> = {
  must: colors.bad,
  high: colors.accent,
  medium: colors.ink3,
  low: colors.line,
};

function RankRow({ item, home }: { item: RankedHome; home: PropertyCard | undefined }) {
  const top = item.rank <= SHOW_REASON_FOR_TOP;
  const [open, setOpen] = useState(top);
  const facts = home ? formatHomeLine(home) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Number ${item.rank}, ${home ? displayAddress(home) : 'home'}, ${FIT_LABEL[item.fit]}`}
      onPress={() => home && router.push(`/properties/${home.id}`)}
      style={({ pressed }) => [s.rankCard, item.rank === 1 && s.rankFirst, pressed && { opacity: 0.85 }]}
    >
      <View style={s.rankTop}>
        <Text style={[s.rankNumber, item.rank === 1 && { color: colors.accent }]}>{item.rank}</Text>
        <HomeThumb home={home} size={52} />
        <View style={s.flex}>
          <Text style={s.rankAddress} numberOfLines={1}>
            {home ? displayAddress(home) : 'Home'}
          </Text>
          {facts ? (
            <Text style={s.rankFacts} numberOfLines={1}>
              {facts}
            </Text>
          ) : null}
        </View>
        <View style={[s.fit, { backgroundColor: FIT_TONE[item.fit].bg }]}>
          <Text style={[s.fitText, { color: FIT_TONE[item.fit].fg }]}>{FIT_LABEL[item.fit].split(' ')[0]}</Text>
        </View>
      </View>
      {item.reason ? (
        open ? (
          <Text style={s.reason}>{item.reason}</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} hitSlop={8}>
            <Text style={s.why}>Why #{item.rank}?</Text>
          </Pressable>
        )
      ) : null}
    </Pressable>
  );
}

function Bubble({ message, onPick }: { message: RankingMessage; onPick?: (text: string) => void }) {
  const mine = message.role === 'user';
  const suggestions = message.suggestions ?? [];
  // Older turns saved before suggestions existed: the question itself is the tappable reply.
  const questionTappable = !!onPick && !!message.question && suggestions.length === 0;
  return (
    <View style={s.turn}>
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleNora]}>
        <Text style={[s.bubbleText, mine && { color: '#FFFFFF' }]}>{message.content}</Text>
        {!mine && message.question ? (
          questionTappable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Sends this as your reply"
              onPress={() => onPick!(message.question!)}
              style={({ pressed }) => [s.questionTap, pressed && s.pressed]}
            >
              <Text style={s.question}>{message.question}</Text>
            </Pressable>
          ) : (
            <Text style={s.question}>{message.question}</Text>
          )
        ) : null}
      </View>
      {!mine && onPick && suggestions.length > 0 ? (
        <View style={s.replies} accessibilityLabel="Suggested replies">
          {suggestions.map((text) => (
            <Pressable
              key={text}
              accessibilityRole="button"
              accessibilityHint="Sends this as your reply"
              onPress={() => onPick(text)}
              style={({ pressed }) => [s.reply, pressed && s.pressed]}
            >
              <Text style={s.replyText}>{text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  const canSend = !disabled && value.trim().length > 0;
  return (
    <View style={s.composer}>
      <TextInput
        accessibilityLabel="Message to NORA"
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        multiline
        maxLength={2000}
        editable={!disabled}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={onSend}
        style={[s.send, !canSend && { opacity: 0.4 }]}
      >
        <Text style={s.sendText}>Send</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 20, gap: 20, paddingBottom: 28 },
  empty: { gap: 14, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 20 },
  emptyTitle: { fontSize: 19, fontWeight: '700', color: colors.ink },
  thinkingCard: {
    alignItems: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thinkingText: { fontSize: 15, color: colors.ink2, textAlign: 'center' },
  freshCard: { gap: 10, backgroundColor: colors.accentSoft, borderRadius: 16, padding: 16 },
  freshText: { fontSize: 15, color: colors.accent, fontWeight: '600' },
  list: { gap: 12 },
  rankCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  rankFirst: { borderColor: colors.accent, borderWidth: 1.5 },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankNumber: { width: 26, fontSize: 24, fontWeight: '800', color: colors.ink3, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankAddress: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rankFacts: { fontSize: 13, color: colors.ink3, marginTop: 2 },
  fit: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  fitText: { fontSize: 12, fontWeight: '700' },
  reason: { fontSize: 15, lineHeight: 22, color: colors.ink2, paddingLeft: 38 },
  why: { fontSize: 14, fontWeight: '600', color: colors.accent, paddingLeft: 38 },
  section: { gap: 12 },
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
  bubble: { maxWidth: '88%', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 15, gap: 8 },
  bubbleNora: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: colors.ink },
  question: { fontSize: 15, lineHeight: 22, color: colors.accent, fontWeight: '600' },
  questionTap: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginHorizontal: -10, backgroundColor: colors.accentSoft },
  turn: { gap: 8 },
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
  pressed: { opacity: 0.6 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 14, color: colors.ink3 },
  footer: { alignItems: 'center' },
  confirm: { gap: 10, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
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
