// A home's page, from the updated mockup: the exterior, NORA fit, price and facts,
// Property details, the latest visit, "Your reaction" (Edit) with Liked / Concerns,
// Visit history with each visit's original words, and Agent notes.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DetailsGrid, FactsRow, PriceLine, SourceLine } from '../../../../components/PropertyFacts';
import { WarningSheet } from '../../../../components/WarningSheet';
import { BackLink, Banner, colors, fontFamily, Screen, TabHeader } from '../../../../components/ui';
import { cityState, displayAddress } from '../../../../lib/address';
import { deleteProperty, fetchHome, type HomeVisit } from '../../../../lib/api';
import { fetchRankingState, latestRanking, type RankedHome } from '../../../../lib/ranking';
import { useThumbnail } from '../../../../lib/thumbnail';
import type { Property } from '../../../../lib/types';

function longWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function visitKind(v: HomeVisit): string {
  return v.duration_seconds > 0 ? `Voice reaction · ${v.duration_seconds} seconds` : 'Typed reaction';
}

/** Bubbles from every visit, newest first, without repeats. */
function bubbles(visits: HomeVisit[], kind: 'liked' | 'concern'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of visits) {
    for (const i of v.note?.items ?? []) {
      const key = i.text.trim().toLowerCase();
      if (i.kind !== kind || seen.has(key)) continue;
      seen.add(key);
      out.push(i.text);
    }
  }
  return out;
}

export default function HomePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [home, setHome] = useState<Property | null>(null);
  const [visits, setVisits] = useState<HomeVisit[]>([]);
  const [fit, setFit] = useState<RankedHome | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchHome(id)
        .then((r) => {
          setHome(r.data.property);
          setVisits(r.data.visits);
          setOffline(r.offline);
          setError('');
        })
        .catch(() => setError("Couldn't load this home. Check your connection."));
      fetchRankingState()
        .then((state) => setFit(latestRanking(state.messages)?.ranking?.find((r) => r.property_id === id) ?? null))
        .catch(() => undefined);
    }, [id]),
  );

  const photo = useThumbnail(home, 'hero');

  if (!home) {
    return (
      <Screen tab>
        <TabHeader />
        <BackLink />
        {error ? <Banner tone="error">{error}</Banner> : <ActivityIndicator color={colors.accent} />}
      </Screen>
    );
  }

  const ready = visits.filter((v) => v.status === 'ready' && v.note);
  const latest = ready[0] ?? null;
  const liked = bubbles(ready, 'liked');
  const concerns = bubbles(ready, 'concern');
  const score = typeof fit?.score === 'number' ? fit.score : null;

  return (
    <Screen tab style={s.screen}>
      <TabHeader />
      <View style={s.topRow}>
        <BackLink />
        <View style={s.private}>
          <Text style={s.privateText}>Private</Text>
        </View>
      </View>

      {offline ? <Banner>{"You're offline. Showing the last saved version."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <View style={s.card}>
        <View style={s.photo}>
          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} /> : null}
          <View style={s.photoChip}>
            <Text style={s.photoChipText}>Exterior preview</Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <View style={s.titleRow}>
            <View style={s.flex}>
              <Text style={s.address} accessibilityRole="header">
                {displayAddress(home)}
              </Text>
              <Text style={s.place}>{cityState(home.city, home.region)}</Text>
            </View>
            <View style={s.fit} accessible accessibilityLabel={score !== null ? `NORA fit ${score} out of 10` : 'NORA fit not scored yet'}>
              <Text style={s.fitLabel}>NORA fit</Text>
              <Text style={s.fitScore}>
                {score !== null ? score.toFixed(1) : '—'}
                <Text style={s.fitOutOf}> /10</Text>
              </Text>
            </View>
          </View>
          <PriceLine home={home} />
          <FactsRow home={home} />
          <DetailsGrid home={home} />
          <SourceLine home={home} />
        </View>
      </View>

      {latest ? (
        <View style={s.visitRow}>
          <SymbolView name="clock" tintColor={colors.accent} size={17} type="monochrome" />
          <View style={s.flex}>
            <Text style={s.visitWhen}>{longWhen(latest.recorded_at)}</Text>
            <Text style={s.visitKind}>{visitKind(latest)}</Text>
          </View>
          <View style={s.visitCount}>
            <Text style={s.visitCountText}>
              {ready.length} {ready.length === 1 ? 'visit' : 'visits'}
            </Text>
          </View>
        </View>
      ) : null}

      {latest?.note ? (
        <View style={s.reactionCard}>
          <View style={s.reactionHead}>
            <Text style={s.reactionTitle}>Your reaction</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/reaction/${latest.id}`)} hitSlop={10}>
              <Text style={s.edit}>Edit</Text>
            </Pressable>
          </View>
          <Text style={s.reactionText}>{latest.note.overall}</Text>
          {liked.length > 0 ? (
            <>
              <Text style={[s.label, { color: colors.good }]}>LIKED</Text>
              <View style={s.chips}>
                {liked.map((t) => (
                  <Text key={t} style={[s.chip, s.chipGood]}>
                    {t}
                  </Text>
                ))}
              </View>
            </>
          ) : null}
          {concerns.length > 0 ? (
            <>
              <Text style={[s.label, { color: colors.bad }]}>CONCERNS</Text>
              <View style={s.chips}>
                {concerns.map((t) => (
                  <Text key={t} style={[s.chip, s.chipBad]}>
                    {t}
                  </Text>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <Text style={s.waiting}>Your note for this home is still being written.</Text>
      )}

      {ready.length > 0 ? (
        <View style={s.historyCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: historyOpen }}
            onPress={() => setHistoryOpen((o) => !o)}
            style={s.historySummary}
          >
            <Text style={s.historySummaryText}>{`${historyOpen ? '▾' : '▸'}  Visit history`}</Text>
          </Pressable>
          {historyOpen
            ? [...ready].reverse().map((v, i) => (
                <View key={v.id} style={s.historyItem}>
                  <Text style={s.historyWhen}>{`Visit ${i + 1} · ${longWhen(v.recorded_at)}`}</Text>
                  <Text style={s.historyKind}>{visitKind(v)}</Text>
                  <Text style={s.historyLabel}>ORIGINAL REACTION</Text>
                  <Text style={s.historyText}>{v.transcript || v.note?.overall}</Text>
                </View>
              ))
            : null}
        </View>
      ) : null}

      <Text style={s.agentTitle}>Agent notes</Text>
      <View style={s.agentCard}>
        <Text style={s.agentHead}>Your agent’s perspective, here.</Text>
        <Text style={s.agentCopy}>Once you share, your agent can review your ranking and add their own notes here.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/sharing')} style={s.agentLink}>
          <Text style={s.agentLinkText}>Share with your agent</Text>
        </Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={() => setAsking(true)} style={s.delete} hitSlop={8}>
        <Text style={s.deleteText}>Delete this home</Text>
      </Pressable>
      <WarningSheet
        visible={asking}
        title="Delete this home?"
        copy="Every visit, transcript and note for this home is deleted for good, and its share links stop working."
        confirmLabel="Delete home"
        cancelLabel="Cancel"
        busy={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await deleteProperty(home.id);
            router.dismissTo('/tour');
          } catch {
            setError('That did not work. Try again.');
          }
          setDeleting(false);
          setAsking(false);
        }}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  private: { backgroundColor: colors.sunk, borderRadius: 13, paddingVertical: 6, paddingHorizontal: 10 },
  privateText: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.ink3 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', height: 190, backgroundColor: '#E8EDF5' },
  photoChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(17,28,49,0.76)',
    borderRadius: 15,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  photoChipText: { fontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  cardBody: { paddingVertical: 12, paddingHorizontal: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  address: { fontFamily, fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  place: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 4 },
  fit: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(33,150,255,0.2)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  fitLabel: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.ink3 },
  fitScore: { fontFamily, fontSize: 17, fontWeight: '800', color: colors.accent, marginTop: 2 },
  fitOutOf: { fontFamily, fontSize: 12, fontWeight: '600', color: colors.ink3 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  visitWhen: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink },
  visitKind: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 2 },
  visitCount: { backgroundColor: colors.accentSoft, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 9 },
  visitCountText: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.accent },
  reactionCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14 },
  reactionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  reactionTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  edit: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent },
  reactionText: { fontFamily, fontSize: 16, lineHeight: 24, color: colors.ink },
  label: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.12, marginTop: 14, marginBottom: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { fontFamily, fontSize: 13, fontWeight: '600', borderRadius: 12, overflow: 'hidden', paddingVertical: 7, paddingHorizontal: 10 },
  chipGood: { backgroundColor: colors.goodSoft, color: colors.good },
  chipBad: { backgroundColor: colors.badSoft, color: colors.bad },
  waiting: { fontFamily, fontSize: 15, color: colors.ink3 },
  historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12 },
  historySummary: { minHeight: 44, justifyContent: 'center' },
  historySummaryText: { fontFamily, fontSize: 13, fontWeight: '600', color: colors.accent },
  historyItem: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 12 },
  historyWhen: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink },
  historyKind: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 2 },
  historyLabel: { fontFamily, fontSize: 12, fontWeight: '600', letterSpacing: 1, color: '#949DAD', marginTop: 8 },
  historyText: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink, marginTop: 4 },
  agentTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 8 },
  agentCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C9D1DE',
    borderRadius: 14,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  agentHead: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  agentCopy: { fontFamily, fontSize: 13, lineHeight: 19, color: colors.ink3, marginTop: 6 },
  agentLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 8 },
  agentLinkText: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.accent },
  delete: { alignSelf: 'center', paddingVertical: 10, marginTop: 4 },
  deleteText: { fontFamily, fontSize: 13, fontWeight: '600', color: colors.ink3 },
});
