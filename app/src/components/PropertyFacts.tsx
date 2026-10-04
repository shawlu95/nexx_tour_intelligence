// A home's public facts as the updated mockup lays them out: price and type, the
// beds / baths / sq ft row, and Property details (year built, lot, parking, HOA).
// Used by the confirm card (details collapsed) and the home page (details open).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { detailRows, homeType, listingPrice, type HomeFacts } from '../lib/format';
import { colors, fontFamily } from './ui';

type Facts = HomeFacts & { facts_status?: 'pending' | 'found' | 'not_found' | 'error' };

function trim(n: number): string {
  return String(Number(Number(n).toFixed(2)));
}

export function PriceLine({ home }: { home: Facts }) {
  return (
    <View style={s.priceLine}>
      <Text style={s.price}>{listingPrice(home)}</Text>
      <Text style={s.type}>{homeType(home)}</Text>
    </View>
  );
}

export function FactsRow({ home }: { home: Facts }) {
  const cells = [
    { value: home.beds != null ? trim(home.beds) : '—', label: 'beds' },
    { value: home.baths != null ? trim(home.baths) : '—', label: 'baths' },
    { value: home.sqft != null ? Number(home.sqft).toLocaleString('en-US') : '—', label: 'sq ft' },
  ];
  return (
    <View style={s.factsRow}>
      {cells.map((c, i) => (
        <View key={c.label} style={[s.fact, i > 0 && s.factDivider]} accessible accessibilityLabel={`${c.value} ${c.label}`}>
          <Text style={s.factValue}>{c.value}</Text>
          <Text style={s.factLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function DetailsGrid({ home }: { home: Facts }) {
  return (
    <View style={s.grid}>
      {detailRows(home).map((d) => (
        <View key={d.label} style={s.cell}>
          <Text style={s.cellLabel}>{d.label}</Text>
          <Text style={s.cellValue}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** "▸ Property details", opening the grid in place (the mockup's <details>). */
export function PropertyDetails({ home }: { home: Facts }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.details}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        hitSlop={6}
        style={s.summary}
      >
        <Text style={s.summaryText}>{`${open ? '▾' : '▸'}  Property details`}</Text>
      </Pressable>
      {open ? <DetailsGrid home={home} /> : null}
    </View>
  );
}

/** Where the facts come from, or why there are none yet. */
export function SourceLine({ home }: { home: Facts }) {
  const text =
    home.facts_status === 'found'
      ? 'Public records and listings · not verified'
      : home.facts_status === 'not_found'
        ? 'No public record found for this address'
        : 'Property facts appear after your first note';
  return <Text style={s.source}>{text}</Text>;
}

const s = StyleSheet.create({
  priceLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6, marginBottom: 8 },
  price: { fontFamily, fontSize: 16, fontWeight: '700', lineHeight: 21, letterSpacing: -0.24, color: '#344156', flexShrink: 1 },
  type: { fontFamily, fontSize: 12, lineHeight: 15.6, color: '#7E8DA3' },
  factsRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  fact: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  factDivider: { borderLeftWidth: 1, borderLeftColor: colors.line },
  factValue: { fontFamily, fontSize: 14, fontWeight: '700', lineHeight: 18.2, color: colors.ink, marginBottom: 1 },
  factLabel: { fontFamily, fontSize: 12, lineHeight: 15.6, color: colors.ink3 },
  details: { marginTop: 5 },
  summary: { paddingVertical: 6 },
  summaryText: { fontFamily, fontSize: 12, lineHeight: 16.8, color: '#6D809B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 16, marginTop: 8, marginBottom: 5 },
  cell: { width: '46%', gap: 4 },
  cellLabel: { fontFamily, fontSize: 12, color: colors.ink3 },
  cellValue: { fontFamily, fontSize: 14, color: colors.ink },
  source: { fontFamily, fontSize: 12, lineHeight: 16.2, color: '#949DAD', marginTop: 4 },
});
