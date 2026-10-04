// Ranking, from the updated mockup: the headline, a compact list (rank, thumbnail,
// address and label, NORA score, drag grip), the first home open with its
// summary, tags and "Open this note", then "Share with your agent" and "Record
// the next home". NORA re-ranks by itself when there's a new home or new
// discussion; after "Save and update ranking" a banner confirms the saved visit.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NestedReorderableList, reorderItems, ScrollViewContainer, useReorderableDrag } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeThumb } from '../../components/HomeThumb';
import { Banner, Body, Button, colors, fontFamily, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { ImpactFeedbackStyle, tapImpact } from '../../lib/haptics';
import type { PropertyCard } from '../../lib/api';
import {
  applyOverride,
  clearOverride,
  differsFrom,
  discussedSinceRanking,
  fetchRankingState,
  formatScore,
  latestRanking,
  newHomesSince,
  saveOverride,
  sendRankingTurn,
  shortLabel,
  type RankedHome,
  type RankingState,
} from '../../lib/ranking';

/** A home NORA hasn't ranked yet, shown at the end of the list until the next ranking. */
function unranked(id: string, rank: number): RankedHome {
  return { property_id: id, rank, fit: 'weak', label: '' };
}

export default function Ranking() {
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const [state, setState] = useState<RankingState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [ranking, setRanking] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const autoRanked = useRef('');

  const rank = useCallback(async () => {
    setRanking(true);
    setError('');
    try {
      const result = await sendRankingTurn('rank');
      // A re-rank shows NORA's new order; the buyer's own drag order is dismissed (the server clears it too).
      setState((s) => (s ? { ...s, messages: [...s.messages, ...result.messages], priorities: result.priorities, override: null } : s));
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "NORA couldn't rank your homes just now. Try again.");
    }
    setRanking(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await fetchRankingState();
      setState(s);
      setLoadError('');
      // Re-rank by itself when the ranking is missing, out of date, or predates scores and labels.
      const current = latestRanking(s.messages);
      const outdated = !!current && !current.ranking!.some((r) => r.label && typeof r.score === 'number');
      const stale = !current || outdated || newHomesSince(current, s.rankableIds).length > 0 || discussedSinceRanking(s.messages);
      const key = `${current?.id ?? 'none'}:${s.rankableIds.length}:${s.messages.length}`;
      if (stale && !s.offline && s.rankableIds.length >= 2 && autoRanked.current !== key) {
        autoRanked.current = key;
        void rank();
      }
    } catch {
      setLoadError("Couldn't load your ranking. Check your connection.");
    }
  }, [rank]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // The saved banner belongs to the visit that was just saved; drop it when leaving.
  useFocusEffect(
    useCallback(() => () => saved && router.setParams({ saved: undefined }), [saved]),
  );

  const latest = state ? latestRanking(state.messages) : null;
  const noraList = latest?.ranking ?? [];
  const fresh = state && latest ? newHomesSince(latest, state.rankableIds) : (state?.rankableIds ?? []);
  // The buyer's dragged order wins over NORA's until they restore it or NORA re-ranks.
  const override = state?.override ?? null;
  const ordered = applyOverride(noraList, override);
  const list = [...ordered, ...fresh.map((id, i) => unranked(id, ordered.length + i + 1))];
  const reordered = differsFrom(noraList, override);
  // The first home starts open; '' means the buyer closed every row. A home that left the list can't stay open.
  const expanded =
    open === '' ? null : open && list.some((r) => r.property_id === open) ? open : (list[0]?.property_id ?? null);
  const enoughHomes = (state?.rankableIds.length ?? 0) >= 2;
  const topHome = list[0] ? state?.homes.get(list[0].property_id) : undefined;
  const headline = reordered && topHome ? `${topHome.address_line} is your #1` : latest?.content || 'Your homes, best fit first';

  async function reorder(next: RankedHome[]) {
    // Homes NORA hasn't ranked yet always stay at the end.
    const ids = next.filter((r) => noraList.some((n) => n.property_id === r.property_id)).map((r) => r.property_id);
    const previous = state?.override ?? null;
    setState((st) => (st ? { ...st, override: ids } : st));
    setError('');
    try {
      await saveOverride(ids);
    } catch {
      setState((st) => (st ? { ...st, override: previous } : st));
      setError("Couldn't save your order. Check your connection.");
    }
  }

  async function restore() {
    const previous = state?.override ?? null;
    setState((st) => (st ? { ...st, override: null } : st));
    try {
      await clearOverride();
    } catch {
      setState((st) => (st ? { ...st, override: previous } : st));
      setError("Couldn't restore NORA's ranking. Check your connection.");
    }
  }

  return (
    // ScrollViewContainer lets the nested ranking list take over vertical drags.
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollViewContainer contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <TabHeader />

        {loadError ? <Banner tone="error">{loadError}</Banner> : null}
        {state?.offline ? <Banner>{"You're offline. Showing your last ranking."}</Banner> : null}
        {!state && !loadError ? <ActivityIndicator color={colors.accent} /> : null}

        {state && !enoughHomes ? (
          <View style={s.empty}>
            <Text style={s.eyebrow}>YOUR RANKING</Text>
            <Text style={s.headline}>Tour a couple of homes first</Text>
            <Body muted>Record your reaction to at least two homes, and NORA will rank them from your notes and the home facts.</Body>
            <Button title="Record a home" onPress={() => router.push('/tour/locate')} />
          </View>
        ) : null}

        {state && enoughHomes ? (
          <>
            <View style={s.heading}>
              <View style={s.flex}>
                <Text style={s.eyebrow}>YOUR RANKING</Text>
                <Text style={s.headline} accessibilityRole="header">
                  {latest ? headline : 'Ranking your homes…'}
                </Text>
              </View>
              <View style={s.count}>
                <Text style={s.countText}>{list.length} homes</Text>
              </View>
            </View>
            <Text style={s.helper}>Tap a home for details. Drag the grip to make this list your own; NORA scores stay unchanged.</Text>

            {reordered ? (
              <View style={s.yourOrder}>
                <View style={s.flex}>
                  <Text style={s.yourOrderTitle}>Your order</Text>
                  <Text style={s.yourOrderCopy}>NORA scores are unchanged</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={restore} hitSlop={8}>
                  <Text style={s.restore}>Restore NORA ranking</Text>
                </Pressable>
              </View>
            ) : null}

            {saved ? (
              <View style={s.savedBanner} accessibilityLiveRegion="polite">
                <Text style={s.savedText}>1 visit saved · Reaction saved</Text>
              </View>
            ) : null}
            {ranking ? (
              <View style={s.updating}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={s.updatingText}>NORA is updating your ranking…</Text>
              </View>
            ) : null}

            {list.length > 0 ? (
              <View style={[s.list, ranking && { opacity: 0.6 }]}>
                <NestedReorderableList
                  // The page scrolls, not the list. Without this React Native warns about a
                  // scrollable list nested in a ScrollView.
                  scrollEnabled={false}
                  data={list}
                  keyExtractor={(r) => r.property_id}
                  onReorder={({ from, to }) => reorder(reorderItems(list, from, to))}
                  renderItem={({ item: r, index }) => (
                    <RankRow
                      item={r}
                      home={state.homes.get(r.property_id)}
                      summary={state.summaries?.[r.property_id]}
                      justAdded={r.property_id === saved}
                      first={index === 0}
                      expanded={expanded === r.property_id}
                      onToggle={() => setOpen(expanded === r.property_id ? '' : r.property_id)}
                    />
                  )}
                />
              </View>
            ) : null}

            <View style={s.actions}>
              <Button title="Share with your agent" onPress={() => router.navigate('/sharing')} />
              <Button kind="secondary" title="Record the next home" onPress={() => router.push('/tour/locate')} />
            </View>
          </>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}
      </ScrollViewContainer>
    </SafeAreaView>
  );
}

function RankRow({
  item,
  home,
  summary,
  justAdded,
  first,
  expanded,
  onToggle,
}: {
  item: RankedHome;
  home: PropertyCard | undefined;
  summary: string | undefined;
  justAdded: boolean;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Drag from the grip (a short hold), or with a long press anywhere on the row.
  const startDrag = useReorderableDrag();
  const drag = () => {
    tapImpact(ImpactFeedbackStyle.Medium);
    startDrag();
  };
  const score = formatScore(item);
  const scored = score !== null;
  const label = scored ? `${shortLabel(item)}${justAdded ? ' · just added' : ''}` : 'New home · not yet scored';
  const pros = item.pros ?? [];
  const cons = item.cons ?? [];
  const address = home ? displayAddress(home) : 'Home';
  return (
    <View style={[s.row, !first && s.rowDivider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Number ${item.rank}, ${address}, ${label}, ${scored ? `score ${score} out of 10` : 'not scored yet'}`}
        onPress={onToggle}
        onLongPress={drag}
        style={({ pressed }) => [s.trigger, pressed && { opacity: 0.7 }]}
      >
        <View style={[s.number, item.rank === 1 && s.numberFirst]}>
          <Text style={[s.numberText, item.rank === 1 && s.numberTextFirst]}>{item.rank}</Text>
        </View>
        <HomeThumb home={home} size={42} />
        <View style={s.flex}>
          <Text style={s.address} numberOfLines={1}>
            {address}
          </Text>
          <Text style={s.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={s.score}>{score ?? '—'}</Text>
        <Pressable
          onLongPress={drag}
          delayLongPress={120}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Drag to move ${address}`}
          style={s.grip}
        >
          <Text style={s.gripText}>⋮⋮</Text>
        </Pressable>
      </Pressable>

      {expanded ? (
        <View style={s.notes}>
          {summary ? <Text style={s.summary}>{summary}</Text> : null}
          {pros.length > 0 || cons.length > 0 ? (
            <View style={s.tags}>
              {pros.map((t) => (
                <Text key={`p-${t}`} style={[s.tag, s.tagPro]}>
                  {t}
                </Text>
              ))}
              {cons.map((t) => (
                <Text key={`c-${t}`} style={[s.tag, s.tagCon]}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
          {home ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/tour/home/${home.id}`)} hitSlop={8} style={s.openNote}>
              <Text style={s.openNoteText}>Open this note</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 0, flexGrow: 1 },
  flex: { flex: 1 },
  empty: { gap: 14, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20, marginTop: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.41, color: colors.accent, marginBottom: 6 },
  headline: { fontFamily, fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.74, color: colors.ink },
  count: { backgroundColor: colors.sunk, borderRadius: 13, paddingVertical: 6, paddingHorizontal: 9 },
  countText: { fontFamily, fontSize: 12, color: '#5F6776' },
  helper: { fontFamily, fontSize: 12, lineHeight: 16.6, color: colors.ink3, marginTop: 8, marginBottom: 14 },
  yourOrder: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  yourOrderTitle: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink },
  yourOrderCopy: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 2 },
  restore: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.accent },
  savedBanner: {
    backgroundColor: colors.goodSoft,
    borderWidth: 1,
    borderColor: '#CFE5D8',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 15,
  },
  savedText: { fontFamily, fontSize: 15, fontWeight: '700', lineHeight: 21, color: colors.good },
  updating: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  updatingText: { fontFamily, fontSize: 13, color: colors.ink3 },
  list: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#D4D9E3', overflow: 'hidden', marginBottom: 13 },
  row: { backgroundColor: colors.surface },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#E6E9EF' },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 11 },
  number: { width: 25, height: 25, borderRadius: 7, backgroundColor: '#EFF2F6', alignItems: 'center', justifyContent: 'center' },
  numberFirst: { backgroundColor: colors.stage },
  numberText: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.ink },
  numberTextFirst: { color: '#FFFFFF' },
  address: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink },
  label: { fontFamily, fontSize: 12, color: colors.ink3, marginTop: 2 },
  score: { fontFamily, fontSize: 16, fontWeight: '700', lineHeight: 20.4, color: colors.accent, minWidth: 26, textAlign: 'right' },
  grip: { width: 22, height: 32, alignItems: 'center', justifyContent: 'center' },
  gripText: { fontFamily, fontSize: 15, letterSpacing: -4, color: '#828B99' },
  notes: { paddingLeft: 92, paddingRight: 11, paddingBottom: 12, gap: 5 },
  summary: { fontFamily, fontSize: 12, lineHeight: 15.9, color: '#555E6D', marginBottom: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { fontFamily, fontSize: 12, fontWeight: '600', borderRadius: 12, overflow: 'hidden', paddingVertical: 5, paddingHorizontal: 7 },
  tagPro: { backgroundColor: colors.goodSoft, color: colors.good },
  tagCon: { backgroundColor: colors.badSoft, color: colors.bad },
  openNote: { paddingVertical: 4, marginTop: 1, alignSelf: 'flex-start' },
  openNoteText: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.accent },
  actions: { gap: 10 },
});
