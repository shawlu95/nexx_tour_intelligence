// Tour tab, from the updated mockup: the home-search header, the dark "Record your
// reaction" card, and Tour history: every toured home with a search box, each row
// opening that home's page.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { HomeThumb } from '../../../components/HomeThumb';
import { TourSearchHeader } from '../../../components/TourSearchHeader';
import { Banner, colors, fontFamily, Screen, TabHeader } from '../../../components/ui';
import { displayAddress } from '../../../lib/address';
import { fetchProperties, fetchTourSummary, type TourSummary } from '../../../lib/api';
import { useUserId } from '../../../lib/auth';
import { formatWhen, startOfWeek } from '../../../lib/format';
import { listPending, type PendingVisit } from '../../../lib/localdb';
import { onQueueChange, runQueue } from '../../../lib/sync';
import type { Property } from '../../../lib/types';

export default function Tour() {
  const userId = useUserId();
  const [homes, setHomes] = useState<Property[] | null>(null);
  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [summary, setSummary] = useState<TourSummary | null>(null);
  const [query, setQuery] = useState('');
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setPending((await listPending(userId)).filter((p) => p.stage !== 'submitted'));
    try {
      const [props, tour] = await Promise.all([fetchProperties(), fetchTourSummary(startOfWeek())]);
      setHomes(props.data.filter((p) => p.last_visited_at));
      setSummary(tour.data);
      setOffline(props.offline);
      setError('');
    } catch {
      setError("Couldn't load your homes. Pull down to try again.");
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onQueueChange(() => void load()), [load]);

  async function refresh() {
    setRefreshing(true);
    await runQueue({ force: true });
    await load();
    setRefreshing(false);
  }

  const q = query.trim().toLowerCase();
  const shown = (homes ?? []).filter(
    (h) => !q || [h.address_line, h.unit, h.city, h.region, h.postal_code].some((f) => f?.toLowerCase().includes(q)),
  );
  const count = homes?.length ?? 0;

  return (
    <Screen tab style={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <TabHeader />
      <TourSearchHeader summary={summary} />

      <View style={s.start}>
        <Text style={s.startTitle}>Record your reaction</Text>
        <Text style={s.startCopy}>About a minute: what you liked, what worried you, and what to ask.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/tour/locate')}
          style={({ pressed }) => [s.startButton, pressed && { opacity: 0.85 }]}
        >
          <Text style={s.startButtonText}>Record a home</Text>
        </Pressable>
      </View>

      {offline ? <Banner>{"You're offline. Showing your last saved homes."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <View style={s.history}>
        <View style={s.titleRow}>
          <Text style={s.historyTitle} accessibilityRole="header">
            Tour history
          </Text>
          <View style={s.count}>
            <Text style={s.countText}>
              {count} {count === 1 ? 'home' : 'homes'}
            </Text>
          </View>
        </View>

        <TextInput
          accessibilityLabel="Search"
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Street, city or ZIP"
          placeholderTextColor="#8C95A6"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />

        <View style={s.list}>
          {/* Notes saved on this phone but not uploaded yet. */}
          {!q &&
            pending.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push(`/tour/note/${p.id}`)}
                style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
              >
                <HomeThumb home={null} size={51} />
                <View style={s.flex}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {p.address_label}
                  </Text>
                  <Text style={s.rowSub} numberOfLines={1}>
                    {p.last_error ? 'Saved on this phone · will retry' : 'Saved on this phone · uploading'}
                  </Text>
                </View>
              </Pressable>
            ))}

          {shown.map((h) => (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              onPress={() => router.push(`/tour/home/${h.id}`)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
            >
              <HomeThumb home={h} size={51} />
              <View style={s.flex}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {displayAddress(h)}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {[h.city, `last visit ${formatWhen(h.last_visited_at!)}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}

          {homes && q && shown.length === 0 ? <Text style={s.empty}>No toured homes match that search.</Text> : null}
          {homes && !q && count === 0 && pending.length === 0 ? (
            <Text style={s.empty}>Homes you record will appear here.</Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 13 },
  start: { backgroundColor: colors.stage, borderRadius: 17, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16 },
  startTitle: { fontFamily, fontSize: 19, fontWeight: '700', lineHeight: 25, letterSpacing: -0.48, color: '#FFFFFF' },
  startCopy: { fontFamily, fontSize: 13, lineHeight: 18.5, color: colors.stage2, marginTop: 7, marginBottom: 16 },
  startButton: { height: 48, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  startButtonText: { fontFamily, fontSize: 14, fontWeight: '700', color: colors.ink },
  history: { marginTop: 14, paddingBottom: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyTitle: { fontFamily, fontSize: 16.6, fontWeight: '700', letterSpacing: -0.42, color: colors.ink },
  count: { backgroundColor: colors.sunk, borderRadius: 13, paddingVertical: 6, paddingHorizontal: 9 },
  countText: { fontFamily, fontSize: 12, fontWeight: '700', color: '#5F6776' },
  search: {
    marginTop: 13,
    height: 46,
    backgroundColor: colors.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#CFD5DF',
    paddingHorizontal: 12,
    fontFamily,
    fontSize: 14,
    color: colors.ink,
  },
  list: { marginTop: 14, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D4D9E3',
  },
  rowTitle: { fontFamily, fontSize: 14.4, fontWeight: '700', lineHeight: 19.4, color: colors.ink },
  rowSub: { fontFamily, fontSize: 12, lineHeight: 17.4, color: colors.ink3, marginTop: 5 },
  empty: { fontFamily, fontSize: 14, color: colors.ink3, textAlign: 'center', paddingVertical: 12 },
});
