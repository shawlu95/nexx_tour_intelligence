import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Body, colors, Eyebrow } from '../components/ui';
import { VisitRow } from '../components/VisitRow';
import { fetchRecentVisits, type VisitSummary } from '../lib/api';
import { useUserId } from '../lib/auth';
import { listPending, type PendingVisit } from '../lib/localdb';
import { onQueueChange, runQueue } from '../lib/sync';

export default function Home() {
  const userId = useUserId();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setPending(await listPending(userId));
    try {
      const result = await fetchRecentVisits();
      setVisits(result.data);
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
    <SafeAreaView style={s.flex} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={s.headerLinks}>
              <HeaderLink label="Homes" onPress={() => router.push('/properties')} />
              <HeaderLink label="Settings" onPress={() => router.push('/settings')} />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record a home"
          onPress={() => router.push('/record/pick')}
          style={({ pressed }) => [s.hero, { opacity: pressed ? 0.9 : 1 }]}
        >
          <Text style={s.heroEyebrow}>JUST LEFT A HOME?</Text>
          <Text style={s.heroTitle}>Record your reaction</Text>
          <Text style={s.heroBody}>About a minute: what you liked, what worried you, what to ask.</Text>
          <View style={s.heroButton}>
            <Text style={s.heroButtonText}>Record a home</Text>
          </View>
        </Pressable>

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
          <Eyebrow>Recent</Eyebrow>
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
                  onPress={() => router.push(`/visit/${v.id}`)}
                />
              ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={s.headerLink}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 20, gap: 20 },
  headerLinks: { flexDirection: 'row', gap: 16 },
  headerLink: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  hero: { backgroundColor: colors.stage, borderRadius: 20, padding: 20, gap: 8 },
  heroEyebrow: { color: '#9DB4FF', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heroTitle: { color: colors.stageInk, fontSize: 24, fontWeight: '800' },
  heroBody: { color: colors.stage2, fontSize: 15, lineHeight: 21 },
  heroButton: { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  heroButtonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  section: { gap: 10 },
});
