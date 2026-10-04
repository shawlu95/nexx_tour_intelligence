// A new note, from the updated mockup: while it's being written, a progress card;
// then "One quick question" (if NORA has one); then "Note ready / Here's what
// mattered." with the home, the reaction, what the buyer liked and noticed, and
// the home's overall fit. "Save and update ranking" re-ranks; "Review this note"
// opens the home's page.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeThumb } from '../../../../components/HomeThumb';
import { Banner, Body, Button, Card, colors, fontFamily, Screen, TabHeader } from '../../../../components/ui';
import { displayAddress } from '../../../../lib/address';
import { answerClarify, fetchVisit, retryVisit, type VisitDetail } from '../../../../lib/api';
import { setAiConsent } from '../../../../lib/consent';
import { homeType, listingPrice } from '../../../../lib/format';
import { getPending, type PendingVisit } from '../../../../lib/localdb';
import { fetchRankingState, latestRanking, type RankedHome } from '../../../../lib/ranking';
import { onQueueChange, runQueue } from '../../../../lib/sync';

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [pending, setPending] = useState<PendingVisit | null>(null);
  const [fit, setFit] = useState<RankedHome | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setPending(await getPending(id));
    try {
      const result = await fetchVisit(id);
      setDetail(result.data);
      setOffline(result.offline);
      if (result.data?.visit.status === 'ready') {
        const state = await fetchRankingState().catch(() => null);
        const latest = state ? latestRanking(state.messages) : null;
        setFit(latest?.ranking?.find((r) => r.property_id === result.data!.property.id) ?? null);
      }
    } catch {
      setOffline(true);
    }
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onQueueChange(() => void load()), [load]);

  const status = detail?.visit.status;
  const waiting = status === undefined ? !!pending : status === 'uploading' || status === 'processing';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  if (!loaded) {
    return (
      <Screen tab>
        <TabHeader />
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!detail && !pending) {
    return (
      <Screen tab>
        <TabHeader />
        <Banner tone="error">{offline ? "You're offline and this note isn't saved on this phone yet." : 'This note no longer exists.'}</Banner>
        <Button kind="secondary" title="Back to Tour" onPress={() => router.dismissTo('/tour')} />
      </Screen>
    );
  }

  const note = detail?.note;
  if (status === 'ready' && detail && note) {
    if (note.clarify && !note.clarify_answer) {
      return (
        <Question
          detail={detail}
          onAnswered={(answer) => setDetail({ ...detail, note: { ...note, clarify_answer: answer } })}
          onError={setError}
          error={error}
        />
      );
    }
    return <NoteReady detail={detail} fit={fit} />;
  }

  return (
    <Screen tab style={s.screen}>
      <TabHeader />
      <Text style={s.address}>{detail ? displayAddress(detail.property) : (pending?.address_label ?? '')}</Text>
      {offline ? <Banner>{"You're offline. Showing the last saved version."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Progress detail={detail} pending={pending} onRetried={load} onError={setError} />
    </Screen>
  );
}

function Progress({
  detail,
  pending,
  onRetried,
  onError,
}: {
  detail: VisitDetail | null;
  pending: PendingVisit | null;
  onRetried: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const status = detail?.visit.status;

  if (status === 'needs_consent') {
    return (
      <Card>
        <Text style={s.cardTitle}>Waiting for your permission</Text>
        <Body>
          AI note processing is off, so this note hasn’t been sent to any AI provider. Allow it to transcribe and organize this note.
        </Body>
        <Button
          title="Allow AI processing"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await setAiConsent(true); // also starts this note
              onRetried();
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Could not turn on AI processing.');
            }
            setBusy(false);
          }}
        />
      </Card>
    );
  }

  if (status === 'failed') {
    return (
      <Card>
        <Text style={s.cardTitle}>{"We couldn't write this note"}</Text>
        <Body>{detail?.visit.error ?? 'Something went wrong.'} Your note is safe.</Body>
        <Button
          title="Try again"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await retryVisit(detail!.visit.id);
              onRetried();
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Could not retry.');
            }
            setBusy(false);
          }}
        />
      </Card>
    );
  }

  const processing = status === 'processing' || status === 'ready' || pending?.stage === 'submitted';
  return (
    <Card style={s.progress}>
      <ActivityIndicator color={colors.accent} />
      <Text style={s.cardTitle}>{processing ? 'Organizing your note' : 'Saved on this phone'}</Text>
      <Body muted style={{ textAlign: 'center' }}>
        {processing
          ? "Usually under 30 seconds. You can leave this screen; we'll let you know when it's ready."
          : 'It uploads as soon as you have a connection.'}
      </Body>
      {pending?.last_error && !processing ? <Text style={s.retry}>Last try: {pending.last_error}</Text> : null}
      {!processing ? (
        <Button
          kind="secondary"
          title="Try uploading now"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await runQueue({ force: true });
            onRetried();
            setBusy(false);
          }}
        />
      ) : null}
    </Card>
  );
}

const MARKS = ['🙂', '🤔', '✕'];

/** "One quick question", full screen as in the mockup. */
function Question({
  detail,
  onAnswered,
  onError,
  error,
}: {
  detail: VisitDetail;
  onAnswered: (answer: string) => void;
  onError: (m: string) => void;
  error: string;
}) {
  const note = detail.note!;
  const clarify = note.clarify!;
  const [saving, setSaving] = useState<string | null>(null);

  async function choose(answer: string) {
    setSaving(answer);
    try {
      await answerClarify(note.id, answer);
      onAnswered(answer);
    } catch {
      onError("Couldn't save your answer. Check your connection.");
    }
    setSaving(null);
  }

  return (
    <Screen tab style={s.questionScreen}>
      <TabHeader />
      <View style={s.organized}>
        <View style={s.organizedDot} />
        <Text style={s.organizedText}>Note organized</Text>
      </View>
      <Text style={s.questionStep}>ONE QUICK QUESTION</Text>
      <Text style={s.questionTitle} accessibilityRole="header">
        {clarify.question}
      </Text>
      {clarify.reason ? <Text style={s.questionCopy}>{clarify.reason}</Text> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      <View style={s.answers}>
        {clarify.options.map((o, i) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}. ${o.detail}`}
            disabled={saving !== null}
            onPress={() => void choose(o.label)}
            style={({ pressed }) => [s.answer, pressed && { opacity: 0.75 }]}
          >
            <View style={s.answerMark}>
              <Text style={s.answerMarkText}>{MARKS[i] ?? '•'}</Text>
            </View>
            <View style={s.flex}>
              <Text style={s.answerLabel}>{o.label}</Text>
              {o.detail ? <Text style={s.answerDetail}>{o.detail}</Text> : null}
            </View>
            {saving === o.label ? <ActivityIndicator color={colors.accent} /> : null}
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void choose('skipped')} disabled={saving !== null} style={s.skip}>
        <Text style={s.skipText}>Skip for now</Text>
      </Pressable>
    </Screen>
  );
}

function factsLine(h: VisitDetail['property']): string {
  const n = (v: number | null, unit: string) => `${v != null ? String(Number(v)) : '—'} ${unit}`;
  const sqft = h.sqft != null ? Number(h.sqft).toLocaleString('en-US') : '—';
  return `${n(h.beds, 'beds')} · ${n(h.baths, 'baths')} · ${sqft} sq ft`;
}

/** "Note ready / Here's what mattered." */
function NoteReady({ detail, fit }: { detail: VisitDetail; fit: RankedHome | null }) {
  const home = detail.property;
  const liked = detail.items.filter((i) => i.kind === 'liked');
  const noticed = detail.items.filter((i) => i.kind === 'concern');
  const score = typeof fit?.score === 'number' ? fit.score : null;

  return (
    <Screen tab style={s.readyScreen}>
      <TabHeader />
      <View style={s.success}>
        <View style={s.check}>
          <Text style={s.checkText}>✓</Text>
        </View>
        <View style={s.flex}>
          <Text style={s.readyEyebrow}>NOTE READY</Text>
          <Text style={s.readyTitle} accessibilityRole="header">
            Here’s what mattered.
          </Text>
        </View>
      </View>

      <View style={s.homeCard}>
        <HomeThumb home={home} size={55} />
        <View style={s.flex}>
          <Text style={s.homeTitle} numberOfLines={1}>
            {displayAddress(home)}
          </Text>
          <Text style={s.homeFacts}>{factsLine(home)}</Text>
          <Text style={s.homeListing}>{`${listingPrice(home)} · ${homeType(home)}`}</Text>
        </View>
      </View>

      {detail.note?.overall ? <Text style={s.reaction}>{detail.note.overall}</Text> : null}

      {liked.length > 0 ? (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.good }]}>YOU LIKED</Text>
          <View style={s.chips}>
            {liked.map((i) => (
              <Text key={i.id} style={[s.chip, s.chipGood]}>
                {i.text}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {noticed.length > 0 ? (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.bad }]}>YOU NOTICED</Text>
          <View style={s.chips}>
            {noticed.map((i) => (
              <Text key={i.id} style={[s.chip, s.chipBad]}>
                {i.text}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.decision}>
        <View style={s.flex}>
          <Text style={s.decisionEyebrow}>OVERALL FIT</Text>
          <Text style={s.decisionLabel}>{score !== null ? fit?.label || 'Scored' : 'Not yet scored'}</Text>
          <Text style={s.decisionNote}>{score !== null ? fit?.note || fit?.cons?.[0] || '' : 'Need more information.'}</Text>
        </View>
        <View style={[s.ring, score !== null && s.ringScored]} accessible accessibilityLabel={score !== null ? `${score} out of 10` : 'Not scored'}>
          <Text style={s.ringText}>{score !== null ? score.toFixed(1) : '—'}</Text>
        </View>
      </View>

      <Button
        title="Save and update ranking"
        onPress={() => router.navigate({ pathname: '/ranking', params: { saved: home.id } })}
        style={s.save}
      />
      <Pressable accessibilityRole="button" onPress={() => router.push(`/tour/home/${home.id}`)} style={s.review} hitSlop={8}>
        <Text style={s.reviewText}>Review this note</Text>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 14 },
  address: { fontFamily, fontSize: 21, fontWeight: '700', letterSpacing: -0.7, color: colors.ink, marginTop: 4 },
  progress: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  cardTitle: { fontFamily, fontSize: 17, fontWeight: '700', color: colors.ink },
  retry: { fontFamily, fontSize: 13, color: colors.ink3, textAlign: 'center' },
  // One quick question
  questionScreen: { gap: 0 },
  organized: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: colors.goodSoft,
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginTop: 16,
  },
  organizedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.good },
  organizedText: { fontFamily, fontSize: 11.5, fontWeight: '700', color: colors.good },
  questionStep: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.56, color: colors.accent, marginTop: 34, marginBottom: 10 },
  questionTitle: { fontFamily, fontSize: 26.4, fontWeight: '700', lineHeight: 33.8, letterSpacing: -0.92, color: colors.ink },
  questionCopy: { fontFamily, fontSize: 14, lineHeight: 21.8, color: colors.ink3, marginTop: 10, marginBottom: 22 },
  answers: { gap: 10 },
  answer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  answerMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F2F4F7', alignItems: 'center', justifyContent: 'center' },
  answerMarkText: { fontSize: 17, color: colors.ink2 },
  answerLabel: { fontFamily, fontSize: 13.8, fontWeight: '700', color: colors.ink },
  answerDetail: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 2 },
  skip: { alignSelf: 'center', marginTop: 18, minHeight: 44, justifyContent: 'center' },
  skipText: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.accent },
  // Note ready
  readyScreen: { gap: 0 },
  success: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 16 },
  check: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.goodSoft, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.good },
  readyEyebrow: { fontFamily, fontSize: 10.9, fontWeight: '700', letterSpacing: 1.41, color: colors.accent, marginBottom: 6 },
  readyTitle: { fontFamily, fontSize: 22.7, fontWeight: '700', color: colors.ink },
  homeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 9,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  homeTitle: { fontFamily, fontSize: 13.4, fontWeight: '700', color: colors.ink },
  homeFacts: { fontFamily, fontSize: 11.2, color: colors.ink3, marginTop: 4 },
  homeListing: { fontFamily, fontSize: 11.2, lineHeight: 16.8, color: '#718199', marginTop: 5 },
  reaction: { fontFamily, fontSize: 16, lineHeight: 25.6, color: colors.ink2, marginTop: 12, marginBottom: 1 },
  section: { marginTop: 17 },
  sectionLabel: { fontFamily, fontSize: 11.2, fontWeight: '700', letterSpacing: 1.12, marginBottom: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { fontFamily, fontSize: 11.5, fontWeight: '600', borderRadius: 12, overflow: 'hidden', paddingVertical: 7, paddingHorizontal: 10 },
  chipGood: { backgroundColor: colors.goodSoft, color: colors.good },
  chipBad: { backgroundColor: colors.badSoft, color: colors.bad },
  decision: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.stage,
    borderRadius: 14,
    padding: 15,
    marginTop: 18,
    marginBottom: 15,
  },
  decisionEyebrow: { fontFamily, fontSize: 9.9, letterSpacing: 0.99, color: '#99A6B8' },
  decisionLabel: { fontFamily, fontSize: 14.4, fontWeight: '700', color: '#FFFFFF', marginTop: 5 },
  decisionNote: { fontFamily, fontSize: 10.9, color: '#AEB9CA', marginTop: 4 },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 5, borderColor: '#4E6384', alignItems: 'center', justifyContent: 'center' },
  ringScored: { borderColor: '#4CB9FF' },
  ringText: { fontFamily, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  save: { minHeight: 48 },
  review: { alignSelf: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center' },
  reviewText: { fontFamily, fontSize: 12.5, fontWeight: '700', color: colors.accent },
});
