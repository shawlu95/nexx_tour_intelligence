import { StyleSheet, Text, View } from 'react-native';
import type { TourSummary } from '../lib/api';
import { colors, fontFamily } from './ui';

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
  search: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent, marginBottom: 6 },
  title: { fontFamily, fontSize: 22, fontWeight: '700', lineHeight: 28, color: colors.ink, letterSpacing: -0.74 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 27, backgroundColor: colors.sunk, borderRadius: 14, paddingHorizontal: 9 },
  weekCount: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.ink },
  weekLabel: { fontFamily, fontSize: 12, color: colors.ink3 },
});
