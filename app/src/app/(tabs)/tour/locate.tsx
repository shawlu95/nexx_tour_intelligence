// "Record a home": finds the home you're at, then asks you to confirm it.
// Recreated from the mockup (locating stage → confirm stage).
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { TourSearchHeader } from '../../../components/TourSearchHeader';
import { Button, colors, Screen, TabHeader } from '../../../components/ui';
import {
  aboutDistance,
  cityState,
  displayAddress,
  distanceMeters,
  normalizedKey,
} from '../../../lib/address';
import { fetchProperties, fetchTourSummary, type TourSummary } from '../../../lib/api';
import { startOfWeek } from '../../../lib/format';
import { geocodeAddress, nearbyAddresses } from '../../../lib/geo';
import { setSuggested, takePicked, type HomeChoice } from '../../../lib/homeChoice';
import { useThumbnail } from '../../../lib/thumbnail';
import type { Property } from '../../../lib/types';

const MIN_LOCATING_MS = 1500; // long enough to read, short enough not to wait on
const SAVED_HOME_METERS = 80; // you're "at" a saved home within this distance

type Found = HomeChoice;

export default function Locate() {
  const [summary, setSummary] = useState<TourSummary | null>(null);
  // A home picked in Change location (which may have replaced this screen) wins over GPS.
  const [initialPick] = useState<Found | null>(() => takePicked());
  const [found, setFound] = useState<Found | null>(initialPick);

  // Coming back from Change location with a pick: show that home.
  useFocusEffect(
    useCallback(() => {
      const picked = takePicked();
      if (picked) setFound(picked);
    }, []),
  );

  // Change location leaves the suggested home out of its list.
  useEffect(() => {
    setSuggested(found);
  }, [found]);

  useEffect(() => {
    fetchTourSummary(startOfWeek())
      .then((r) => setSummary(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initialPick) return; // opened with a home picked in Change location: no GPS lookup
    let cancelled = false;
    const started = Date.now();
    const finish = (f: Found | null) => {
      const wait = Math.max(0, MIN_LOCATING_MS - (Date.now() - started));
      setTimeout(() => {
        if (cancelled) return;
        if (f) setFound(f);
        else router.replace('/tour/pick'); // nothing found: pick from the list or type it
      }, wait);
    };
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return finish(null);
        const pos =
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const [properties, nearby] = await Promise.all([
          fetchProperties()
            .then((r) => r.data)
            .catch(() => [] as Property[]),
          nearbyAddresses(here),
        ]);

        // One of your saved homes, if you're right by it.
        const saved = properties
          .filter((p) => p.latitude !== null && p.longitude !== null)
          .map((p) => ({ property: p, meters: distanceMeters(here, { latitude: p.latitude!, longitude: p.longitude! }) }))
          .sort((a, b) => a.meters - b.meters)[0];
        if (saved && saved.meters <= SAVED_HOME_METERS) return finish({ kind: 'existing', ...saved });

        // Otherwise the nearest street address, measured to the house itself.
        const known = new Set(properties.map((p) => normalizedKey({ addressLine: p.address_line, unit: p.unit ?? '', city: p.city ?? '' })));
        const draft = nearby.find((d) => !known.has(normalizedKey(d))) ?? nearby[0];
        if (!draft) return finish(null);
        const house = await geocodeAddress(draft);
        const at = house ?? (draft.latitude !== null ? { latitude: draft.latitude, longitude: draft.longitude! } : null);
        finish({
          kind: 'new',
          draft: house ? { ...draft, latitude: house.latitude, longitude: house.longitude } : draft,
          meters: at ? distanceMeters(here, at) : null,
        });
      } catch {
        finish(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPick]);

  return (
    <Screen tab style={s.screen}>
      <TabHeader />
      <TourSearchHeader summary={summary} />
      {found ? <Confirm found={found} /> : <Locating />}
    </Screen>
  );
}

/** Two thin rings breathing around a blue dot (mockup: 1.7 s ease, second ring 0.35 s later). */
function Locating() {
  return (
    <View style={s.locating} accessibilityLiveRegion="polite">
      <View style={s.rings}>
        <Ring size={100} delay={0} />
        <Ring size={136} delay={350} />
        <View style={s.dot}>
          <View style={s.dotCore} />
        </View>
      </View>
      <Text style={s.locEyebrow}>USING YOUR LOCATION</Text>
      <Text style={s.locTitle}>Finding this home…</Text>
      <Text style={s.locBody}>Checking the closest residential address.</Text>
    </View>
  );
}

function Ring({ size, delay }: { size: number; delay: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [t, delay]);
  return (
    <Animated.View
      style={[
        s.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1.08] }) }],
        },
      ]}
    />
  );
}

function Confirm({ found }: { found: Found }) {
  const isSaved = found.kind === 'existing';
  const home = isSaved
    ? found.property
    : { id: `new:${normalizedKey(found.draft)}`, latitude: found.draft.latitude, longitude: found.draft.longitude };
  const photo = useThumbnail(home, 'hero');
  const address = isSaved ? displayAddress(found.property) : found.draft.addressLine;
  const place = isSaved ? cityState(found.property.city, found.property.region) : cityState(found.draft.city, found.draft.region);
  const facts = isSaved ? found.property : null;
  const hasFacts = !!facts && (facts.beds != null || facts.baths != null || facts.sqft != null);
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  function start(how: 'record' | 'type') {
    const pathname = how === 'record' ? '/tour/record' : '/tour/type';
    if (found.kind === 'existing') {
      router.push({ pathname, params: { propertyId: found.property.id, label: displayAddress(found.property) } });
    } else {
      router.push({ pathname, params: { draft: JSON.stringify(found.draft), label: found.draft.addressLine } });
    }
  }

  return (
    <Animated.View style={[s.confirm, { opacity: fade }]}>
      <View style={s.foundRow}>
        <View style={s.foundPill}>
          <Text style={s.foundText}>Location found</Text>
        </View>
        {found.meters !== null ? <Text style={s.away}>{aboutDistance(found.meters)}</Text> : null}
      </View>

      <View style={s.card}>
        <View style={s.photo}>
          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} /> : null}
          <View style={s.previewChip}>
            <Text style={s.previewText}>Exterior preview</Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={s.areYou}>ARE YOU HERE?</Text>
          <Text style={s.address} accessibilityRole="header">
            {address}
          </Text>
          {place ? <Text style={s.place}>{place}</Text> : null}
          <View style={s.facts}>
            <Fact value={facts?.beds} label="beds" />
            <Fact value={facts?.baths} label="baths" divider />
            <Fact value={facts?.sqft} label="sq ft" divider thousands />
          </View>
          <Text style={s.factsNote}>{hasFacts ? 'Property facts · public record' : 'Property facts appear after your first note.'}</Text>
        </View>
      </View>

      <View style={s.actions}>
        <View style={s.startRow}>
          <Button title="Start with voice" onPress={() => start('record')} style={s.flex} />
          <Button kind="secondary" title="Type instead" onPress={() => start('type')} style={s.flex} />
        </View>
        <Text style={s.correct}>Choose voice or typing for this note.</Text>
        <Button kind="ghost" title="Change location" onPress={() => router.push('/tour/pick')} />
        <Text style={s.correct}>You can correct property details later.</Text>
      </View>
    </Animated.View>
  );
}

function Fact({ value, label, divider, thousands }: { value?: number | null; label: string; divider?: boolean; thousands?: boolean }) {
  const text = value == null ? '—' : thousands ? Number(value).toLocaleString('en-US') : String(Number(value));
  return (
    <View style={[s.fact, divider && s.factDivider]}>
      <Text style={s.factValue}>{text}</Text>
      <Text style={s.factLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 18 },
  // Locating stage
  locating: { alignItems: 'center', paddingTop: 70 },
  rings: { width: 136, height: 136, alignItems: 'center', justifyContent: 'center', marginBottom: 34 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(49,100,244,0.2)' },
  dot: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3164F4',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  dotCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFFFFF' },
  locEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  locTitle: { fontSize: 21, fontWeight: '700', color: colors.ink, marginTop: 10 },
  locBody: { fontSize: 14, color: colors.ink2, marginTop: 8 },
  // Confirm stage
  confirm: { gap: 12 },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  foundPill: { backgroundColor: colors.goodSoft, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  foundText: { fontSize: 13, fontWeight: '700', color: colors.good },
  away: { fontSize: 13, color: colors.ink2 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 1.85, backgroundColor: colors.sunk },
  previewChip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(24,32,46,0.82)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  previewText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  cardBody: { padding: 16, gap: 4 },
  areYou: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  address: { fontSize: 23, fontWeight: '700', color: colors.ink, letterSpacing: -0.3, marginTop: 4 },
  place: { fontSize: 14, color: colors.ink2 },
  facts: {
    flexDirection: 'row',
    marginTop: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  fact: { flex: 1, alignItems: 'center', gap: 2 },
  factDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
  factValue: { fontSize: 16, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  factLabel: { fontSize: 13, color: colors.ink2 },
  factsNote: { fontSize: 12, color: colors.ink3, marginTop: 10 },
  actions: { gap: 10, marginTop: 4 },
  startRow: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  correct: { fontSize: 12, color: colors.ink3, textAlign: 'center', marginTop: 2 },
});
