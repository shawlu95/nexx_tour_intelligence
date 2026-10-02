// History tab, recreated from the mockup: every visit grouped by the day it was
// recorded, each row showing NORA's score, the address, two traits from the note,
// and the time of the visit.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Banner, Body, colors, Screen, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { fetchHistory, fetchTourSummary, type HistoryVisit, type TourSummary } from '../../lib/api';
import { groupByDay, startOfWeek, timeOfDay, traitsLine } from '../../lib/format';

type Badge = 'top' | 'latest' | 'plain';

export default function History() {
  const [visits, setVisits] = useState<HistoryVisit[] | null>(null);
  const [summary, setSummary] = useState<TourSummary | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchHistory()
        .then((r) => {
          setVisits(r.data);
          setOffline(r.offline);
          setError('');
        })
        .catch(() => setError("Couldn't load your history. Check your connection."));
      fetchTourSummary(startOfWeek())
        .then((r) => setSummary(r.data))
        .catch(() => undefined);
    }, []),
  );

  const scores = summary?.scores ?? {};
  const topScore = Math.max(-Infinity, ...Object.values(scores));
  const latestId = visits?.[0]?.id;
  const homes = summary?.toured ?? new Set((visits ?? []).map((v) => v.property_id)).size;

  function badgeOf(v: HistoryVisit): Badge {
    if (scores[v.property_id] === topScore) return 'top';
    if (v.id === latestId) return 'latest';
    return 'plain';
  }

  return (
    <Screen tab style={s.screen}>
      <TabHeader />

      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={s.flex}>
            <Text style={s.eyebrow}>YOUR MEMORY</Text>
            <Text style={s.title} accessibilityRole="header">
              Tour history
            </Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipText}>
              {homes} {homes === 1 ? 'home' : 'homes'}
            </Text>
          </View>
        </View>
        <Text style={s.subtitle}>Every note, organized by when you visited.</Text>
      </View>

      {offline ? <Banner>{"You're offline. Showing your last saved list."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {visits && visits.length === 0 ? <Body muted>Homes you record will appear here.</Body> : null}

      {groupByDay(visits ?? [], (v) => v.recorded_at).map((section) => (
        <View key={section.title} style={s.section}>
          <Text style={s.sectionTitle}>{section.title}</Text>
          {section.items.map((v) => (
            <HistoryRow key={v.id} visit={v} score={scores[v.property_id]} badge={badgeOf(v)} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function HistoryRow({ visit, score, badge }: { visit: HistoryVisit; score: number | undefined; badge: Badge }) {
  const address = visit.properties ? displayAddress(visit.properties) : 'Unknown address';
  const traits =
    visit.status === 'failed'
      ? "Couldn't write the note"
      : visit.status !== 'ready'
        ? 'Writing your note…'
        : traitsLine(visit.notes?.note_items ?? []) || visit.notes?.overall || '';
  const time = timeOfDay(visit.recorded_at);
  const scoreText = typeof score === 'number' ? score.toFixed(1) : '–';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[address, traits, time, typeof score === 'number' ? `score ${scoreText}` : null].filter(Boolean).join(', ')}
      onPress={() => router.push(`/visit/${visit.id}`)}
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
    >
      <View style={[s.badge, badge === 'top' ? s.badgeTop : badge === 'latest' ? s.badgeLatest : null]}>
        <Text style={[s.badgeText, badge === 'top' ? s.badgeTextTop : badge === 'latest' ? s.badgeTextLatest : null]}>
          {scoreText}
        </Text>
      </View>
      <View style={s.flex}>
        <Text style={s.address} numberOfLines={1}>
          {address}
        </Text>
        {traits ? (
          <Text style={s.traits} numberOfLines={1}>
            {traits}
          </Text>
        ) : null}
      </View>
      <Text style={s.time}>{time}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { gap: 18 },
  flex: { flex: 1, gap: 3 },
  header: { gap: 8, marginTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  chip: { backgroundColor: colors.sunk, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink2 },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.ink2 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.ink3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowPressed: { backgroundColor: colors.sunk },
  badge: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' },
  badgeTop: { backgroundColor: colors.ink },
  badgeLatest: { backgroundColor: colors.accentSoft },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.ink2, fontVariant: ['tabular-nums'] },
  badgeTextTop: { color: colors.surface },
  badgeTextLatest: { color: colors.accent },
  address: { fontSize: 16, fontWeight: '700', color: colors.ink },
  traits: { fontSize: 13, color: colors.ink3 },
  time: { fontSize: 13, color: colors.ink3, fontVariant: ['tabular-nums'] },
});
