import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayAddress } from '../lib/address';
import { factTiles } from '../lib/format';
import { useThumbnail } from '../lib/thumbnail';
import type { Property } from '../lib/types';
import { colors, fontFamily } from './ui';

/**
 * Top of a home's page or a visit's note: a full-width street-level photo, the
 * address, and the public facts as large, evenly spaced tiles.
 */
export function HomeHero({
  home,
  eyebrow,
  onPress,
}: {
  home: Property;
  eyebrow?: string;
  onPress?: () => void;
}) {
  const uri = useThumbnail(home, 'hero');
  const tiles = factTiles(home);
  const place = [home.city, home.region].filter(Boolean).join(', ');

  const heading = (
    <View style={s.heading}>
      {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
      <Text style={s.address} accessibilityRole="header">
        {displayAddress(home)}
      </Text>
      {place ? <Text style={s.place}>{place}</Text> : null}
      {onPress ? <Text style={s.link}>All visits to this home ›</Text> : null}
    </View>
  );

  return (
    <View style={s.root}>
      <View style={s.photo}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
        ) : (
          <SymbolView name="house" tintColor={colors.ink3} size={44} type="monochrome" />
        )}
      </View>
      {uri ? <Text style={s.credit}>Imagery © Apple</Text> : null}

      {onPress ? (
        <Pressable accessibilityRole="link" accessibilityHint="Opens all visits to this home" onPress={onPress}>
          {heading}
        </Pressable>
      ) : (
        heading
      )}

      {tiles.length > 0 ? (
        <View style={s.facts}>
          {tiles.map((t, i) => (
            <View key={t.label} style={[s.tile, i > 0 && s.tileDivider]}>
              <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>
                {t.value}
              </Text>
              <Text style={s.label} numberOfLines={1}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>
      ) : home.facts_status === 'pending' ? (
        <Text style={s.pending}>Home details will appear after the lookup.</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 18 },
  photo: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.sunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credit: { fontFamily, fontSize: 11, color: colors.ink3, marginTop: -12, alignSelf: 'flex-end' },
  heading: { gap: 4 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.accent },
  address: { fontFamily, fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.4, lineHeight: 31 },
  place: { fontFamily, fontSize: 16, color: colors.ink3 },
  link: { fontFamily, fontSize: 14, fontWeight: '600', color: colors.accent, marginTop: 6 },
  facts: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 18,
  },
  tile: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  tileDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  value: { fontFamily, fontSize: 22, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  label: { fontFamily, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.ink3 },
  pending: { fontFamily, fontSize: 14, color: colors.ink3 },
});
