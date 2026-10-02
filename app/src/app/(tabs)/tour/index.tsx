import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Banner, Body, colors, Eyebrow, Screen, TabHeader } from '../../../components/ui';
import { TourSearchHeader } from '../../../components/TourSearchHeader';
import { VisitRow } from '../../../components/VisitRow';
import { fetchRecentVisits, fetchTourSummary, type TourSummary, type VisitSummary } from '../../../lib/api';
import { startOfWeek } from '../../../lib/format';
import { useUserId } from '../../../lib/auth';
import { listPending, type PendingVisit } from '../../../lib/localdb';
import { onQueueChange, runQueue } from '../../../lib/sync';

export default function Home() {
  const userId = useUserId();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<TourSummary | null>(null);

  const load = useCallback(async () => {
    setPending(await listPending(userId));
    try {
      const [result, tour] = await Promise.all([fetchRecentVisits(), fetchTourSummary(startOfWeek())]);
      setVisits(result.data);
      setSummary(tour.data);
      setOffline(result.offline);
      setError('');
    } catch {
      setError("Couldn't load your notes. Pull down to try again.");
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onQueueChange(() => void load()), [load]);

  // Keep refreshing while something is still being processed.
  const busy = pending.length > 0 || visits.some((v) => v.status === 'uploading' || v.status === 'processing');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function refresh() {
    setRefreshing(true);
    await runQueue({ force: true });
    await load();
    setRefreshing(false);
  }

  // Recordings the server doesn't know about yet come from the phone's queue.
  const serverIds = new Set(visits.map((v) => v.id));
  const localOnly = pending.filter((p) => !serverIds.has(p.id) || p.stage !== 'submitted');
  const localIds = new Set(localOnly.map((p) => p.id));

  return (
    <Screen tab style={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <TabHeader />

        <TourSearchHeader summary={summary} />

        <View style={s.hero}>
          <View style={s.pin}>
            <SymbolView name="mappin.and.ellipse" tintColor="#9DB4FF" size={24} type="monochrome" />
          </View>
          <Text style={s.heroEyebrow}>NEW HOME</Text>
          <Text style={s.heroTitle}>Ready to record another home?</Text>
          <Text style={s.heroBody}>We’ll use your location to suggest the property you’re visiting.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/tour/locate')}
            style={({ pressed }) => [s.heroButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.heroButtonText}>Record a home</Text>
          </Pressable>
          <View style={s.heroNote}>
            <SymbolView name="lock" tintColor={colors.stage2} size={11} type="monochrome" />
            <Text style={s.heroNoteText}>Location is used only after you tap.</Text>
          </View>
        </View>

        {offline ? <Banner>{"You're offline. Showing your last saved notes."}</Banner> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}

        {localOnly.length > 0 && (
          <View style={s.section}>
            <Eyebrow>On this phone</Eyebrow>
            {localOnly.map((p) => (
              <VisitRow
                key={p.id}
                address={p.address_label}
                recordedAt={p.recorded_at}
                state={p.stage === 'submitted' ? 'processing' : 'waiting'}
                summary={p.last_error ? `Will retry: ${p.last_error}` : 'Saved. It uploads as soon as you have a connection.'}
                onPress={() => router.push(`/visit/${p.id}`)}
              />
            ))}
          </View>
        )}

        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Last recorded</Text>
            <Pressable accessibilityRole="link" onPress={() => router.navigate('/homes')} hitSlop={8}>
              <Text style={s.seeHistory}>See history</Text>
            </Pressable>
          </View>
          {visits.filter((v) => !localIds.has(v.id)).length === 0 && localOnly.length === 0 ? (
            <Body muted>Your notes will appear here after your first recording.</Body>
          ) : (
            visits
              .filter((v) => !localIds.has(v.id))
              .map((v) => (
                <VisitRow
                  key={v.id}
                  address={v.properties ?? 'Unknown address'}
                  recordedAt={v.recorded_at}
                  state={v.status}
                  summary={v.status === 'failed' ? v.error : v.notes?.overall}
                  score={summary?.scores[v.property_id]}
                  onPress={() => router.push(`/visit/${v.id}`)}
                />
              ))
          )}
        </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: { gap: 18 },
  flex: { flex: 1 },
  // Dark "NEW HOME" card (mockup).
  hero: {
    backgroundColor: colors.stage,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#14203C',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  pin: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroEyebrow: { color: '#9DB4FF', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  heroBody: { color: colors.stage2, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  heroButton: {
    alignSelf: 'stretch',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButtonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  heroNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  heroNoteText: { color: colors.stage2, fontSize: 12 },
  // "Last recorded / See history".
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  seeHistory: { fontSize: 14, fontWeight: '700', color: colors.accent },
});
