import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NestedReorderableList, reorderItems, ScrollViewContainer, useReorderableDrag } from 'react-native-reorderable-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { HomeThumb } from '../../components/HomeThumb';
import { Banner, Body, Button, colors, Eyebrow, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
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
  type Fit,
  type RankedHome,
  type RankingState,
} from '../../lib/ranking';

export default function Ranking() {
  const [state, setState] = useState<RankingState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [ranking, setRanking] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const started = useRef(false);

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
      // Rank right away on first visit, or once if the latest ranking predates short labels.
      const current = latestRanking(s.messages);
      const outdated = !!current && !current.ranking!.some((r) => r.label && typeof r.score === 'number');
      if (!started.current && !s.offline && (!current || outdated) && s.rankableIds.length >= 2) {
        started.current = true;
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

  const latest = state ? latestRanking(state.messages) : null;
  const fresh = state && latest ? newHomesSince(latest, state.rankableIds) : [];
  const discussed = state ? discussedSinceRanking(state.messages) : false;
  const enoughHomes = (state?.rankableIds.length ?? 0) >= 2;
  const noraList = latest?.ranking ?? [];
  // The buyer's dragged order wins over NORA's until they revert or re-rank.
  const override = state?.override ?? null;
  const list = applyOverride(noraList, override);
  const reordered = differsFrom(noraList, override);
  const expanded = open ?? list[0]?.property_id ?? null;

  async function reorder(next: RankedHome[]) {
    const ids = next.map((r) => r.property_id);
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

  async function revert() {
    const previous = state?.override ?? null;
    setState((st) => (st ? { ...st, override: null } : st));
    try {
      await clearOverride();
    } catch {
      setState((st) => (st ? { ...st, override: previous } : st));
      setError("Couldn't restore NORA's ranking. Check your connection.");
    }
  }

  const topHome = list[0] ? state?.homes.get(list[0].property_id) : undefined;

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
          <Eyebrow>Your ranking</Eyebrow>
          <Text style={s.headline}>Tour a couple of homes first</Text>
          <Body muted>Record your reaction to at least two homes, and NORA will rank them from your notes and the home facts.</Body>
          <Button title="Record a home" onPress={() => router.push('/tour/locate')} />
        </View>
      ) : null}

      {state && enoughHomes && !latest ? (
        <View style={s.empty}>
          <Eyebrow>Your ranking</Eyebrow>
          {ranking ? (
            <View style={s.thinking}>
              <ActivityIndicator color={colors.accent} />
              <Text style={s.thinkingText}>NORA is reading your notes and ranking your homes…</Text>
            </View>
          ) : (
            <Button title="Rank my homes" onPress={rank} />
          )}
        </View>
      ) : null}

      {state && latest ? (
        <>
          <View style={s.heading}>
            <View style={s.headingRow}>
              <Eyebrow>{reordered ? 'Your order' : 'Your ranking'}</Eyebrow>
              <View style={s.count}>
                <Text style={s.countText}>{list.length} homes</Text>
              </View>
            </View>
            <Text style={s.headline} accessibilityRole="header">
              {reordered && topHome ? `${topHome.address_line} is your #1` : latest.content || 'Your homes, best fit first'}
            </Text>
            <Text style={s.helper}>Tap a home for details. Drag the grip to make this list your own; NORA scores stay unchanged.</Text>
            {reordered ? (
              <Pressable accessibilityRole="button" onPress={revert} hitSlop={8} style={s.revert}>
                <SymbolView name="arrow.uturn.backward" tintColor={colors.ink3} size={12} type="monochrome" />
                <Text style={s.revertText}>Restore NORA ranking</Text>
              </Pressable>
            ) : null}
          </View>

          {fresh.length > 0 || discussed ? (
            <View style={s.update}>
              <Text style={s.updateText}>
                {fresh.length > 0
                  ? fresh.length === 1
                    ? "You've recorded a new home since this ranking."
                    : `You've recorded ${fresh.length} new homes since this ranking.`
                  : 'You discussed new preferences since this ranking.'}
              </Text>
              <Button title="Update ranking" onPress={rank} loading={ranking} />
            </View>
          ) : null}

          <View style={[s.list, ranking && { opacity: 0.5 }]}>
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
                  first={index === 0}
                  expanded={expanded === r.property_id}
                  onToggle={() => setOpen(expanded === r.property_id ? '' : r.property_id)}
                />
              )}
            />
          </View>

          <View style={s.actions}>
            <Button title="Record the next home" onPress={() => router.push('/tour/locate')} />
            <Button kind="secondary" title="Ask Nora" onPress={() => router.push('/ranking/discuss')} accessibilityLabel="Ask Nora about your ranking" />
          </View>
        </>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}
      </ScrollViewContainer>
    </SafeAreaView>
  );
}

const FIT: Record<Fit, { label: string; color: string }> = {
  strong: { label: 'Strong', color: colors.good },
  good: { label: 'Good', color: colors.accent },
  weak: { label: 'Weak', color: colors.ink3 },
};

function RankRow({
  item,
  home,
  first,
  expanded,
  onToggle,
}: {
  item: RankedHome;
  home: PropertyCard | undefined;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Starts a drag of this row: a short hold on the number, or a long press anywhere.
  // Not on touch-down: a swipe that starts on the number must still scroll the page, and
  // a quick tap could leave the library's page-scroll lock on (it unlocks on finger-up).
  const drag = useReorderableDrag();
  const label = shortLabel(item);
  const pros = item.pros ?? [];
  const cons = item.cons ?? [];
  const address = home ? displayAddress(home) : 'Home';
  const score = formatScore(item);
  const hasDetail = pros.length > 0 || cons.length > 0 || !!home;
  return (
    <View style={[s.row, !first && s.rowDivider]}>
      <View style={s.rowTop}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Number ${item.rank}, ${address}${label ? `, ${label}` : ''}, ${score ? `score ${score} out of 10` : `${FIT[item.fit].label} fit`}`}
        onPress={onToggle}
        onLongPress={drag}
        style={({ pressed }) => [s.rowMain, pressed && { opacity: 0.7 }]}
      >
        {/* The number is the drag handle ("Drag its number to change the order"). */}
        <Pressable
          onLongPress={drag}
          delayLongPress={150}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Drag to move ${address}`}
          style={[s.badge, item.rank === 1 && s.badgeFirst]}
        >
          <Text style={[s.badgeText, item.rank === 1 && s.badgeTextFirst]}>{item.rank}</Text>
        </Pressable>
        <HomeThumb home={home} size={48} />
        <View style={s.flex}>
          <Text style={s.address} numberOfLines={1}>
            {address}
          </Text>
          {label ? (
            <Text style={s.label} numberOfLines={2}>
              {label}
            </Text>
          ) : null}
        </View>
        {score ? (
          <Text style={[s.score, item.rank === 1 && { color: colors.accent }]}>{score}</Text>
        ) : (
          <Text style={[s.fit, { color: FIT[item.fit].color }]}>{FIT[item.fit].label}</Text>
        )}
      </Pressable>
      </View>

      {expanded && hasDetail ? (
        <View style={s.detail}>
          {pros.length > 0 || cons.length > 0 ? (
            <View style={s.tags}>
              {pros.map((t) => (
                <View key={`p-${t}`} style={[s.tag, s.tagPro]}>
                  <Text style={[s.tagText, { color: colors.good }]}>{t}</Text>
                </View>
              ))}
              {cons.map((t) => (
                <View key={`c-${t}`} style={[s.tag, s.tagCon]}>
                  <Text style={[s.tagText, { color: colors.warn }]}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {home ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/properties/${home.id}`)} hitSlop={8}>
              <Text style={s.open}>Open home ›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 20, gap: 18, flexGrow: 1 },
  flex: { flex: 1 },
  empty: { gap: 14, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 20 },
  thinking: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  thinkingText: { fontSize: 15, color: colors.ink2, textAlign: 'center' },
  heading: { gap: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { backgroundColor: colors.sunk, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  countText: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  headline: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4, lineHeight: 31 },
  helper: { fontSize: 14, color: colors.ink3 },
  update: { gap: 10, backgroundColor: colors.accentSoft, borderRadius: 16, padding: 16 },
  updateText: { fontSize: 15, color: colors.accent, fontWeight: '600' },
  list: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { paddingHorizontal: 16, backgroundColor: colors.surface },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  revert: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2 },
  revertText: { fontSize: 13, color: colors.ink3, fontWeight: '600' },
  badge: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' },
  badgeFirst: { backgroundColor: colors.ink },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.ink2, fontVariant: ['tabular-nums'] },
  badgeTextFirst: { color: '#FFFFFF' },
  address: { fontSize: 15, fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, lineHeight: 16, color: colors.ink3, marginTop: 2 },
  score: { fontSize: 14, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'right' },
  fit: { fontSize: 13, fontWeight: '700' },
  detail: { gap: 10, paddingBottom: 14, paddingLeft: 34 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  tagPro: { backgroundColor: colors.goodSoft },
  tagCon: { backgroundColor: colors.warnSoft },
  tagText: { fontSize: 12, fontWeight: '600' },
  open: { fontSize: 14, fontWeight: '600', color: colors.accent },
  actions: { gap: 10 },
});
