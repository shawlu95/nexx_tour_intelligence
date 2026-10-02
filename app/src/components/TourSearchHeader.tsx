import { StyleSheet, Text, View } from 'react-native';
import type { TourSummary } from '../lib/api';
import { colors } from './ui';

/** "YOUR HOME SEARCH / N homes toured" with the "this week" chip, as in the mockup's Tour screens. */
export function TourSearchHeader({ summary }: { summary: TourSummary | null }) {
  return (
    <View style={s.search}>
      <View style={s.flex}>
        <Text style={s.eyebrow}>YOUR HOME SEARCH</Text>
        <Text style={s.title}>{summary ? `${summary.toured} ${summary.toured === 1 ? 'home' : 'homes'} toured` : ' '}</Text>
      </View>
      <View style={s.week} accessible accessibilityLabel={`${summary?.thisWeek ?? 0} this week`}>
        <Text style={s.weekCount}>{summary?.thisWeek ?? 0}</Text>
        <Text style={s.weekLabel}>this week</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4, marginTop: 4 },
  week: { backgroundColor: colors.sunk, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  weekCount: { fontSize: 20, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  weekLabel: { fontSize: 11, color: colors.ink3 },
});
