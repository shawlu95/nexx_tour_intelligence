// "Record a home": finds the home you're at, then asks you to confirm it.
// Recreated from the mockup (locating stage → confirm stage).
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSheet } from '../../../components/DesignSheet';
import { FactsRow, PriceLine, PropertyDetails, SourceLine } from '../../../components/PropertyFacts';
import { Button, colors, fontFamily, Screen } from '../../../components/ui';
import {
  aboutDistance,
  cityState,
  displayAddress,
  distanceMeters,
  normalizedKey,
} from '../../../lib/address';
import { fetchProperties, fetchProperty } from '../../../lib/api';
import { geocodeAddress, nearbyAddresses } from '../../../lib/geo';
import { setSuggested, takePicked, type HomeChoice } from '../../../lib/homeChoice';
import { tapSelection } from '../../../lib/haptics';
import { useThumbnail } from '../../../lib/thumbnail';
import type { Property } from '../../../lib/types';

const MIN_LOCATING_MS = 1500; // long enough to read, short enough not to wait on
const SAVED_HOME_METERS = 80; // you're "at" a saved home within this distance

type Found = HomeChoice;

export default function Locate() {
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
    <Screen header style={s.screen}>
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
  // A new home has no facts until its first note is processed.
  const facts = isSaved ? found.property : { facts_status: 'pending' as const };
  const [mode, setMode] = useState<'record' | 'type'>('record');
  const [revisit, setRevisit] = useState<{ count: number; last: string | null } | null>(null);
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [fade]);

  function pick(next: 'record' | 'type') {
    if (next !== mode) tapSelection();
    setMode(next);
  }

  function go() {
    setRevisit(null);
    const pathname = mode === 'record' ? '/tour/record' : '/tour/type';
    if (found.kind === 'existing') {
      router.push({ pathname, params: { propertyId: found.property.id, label: displayAddress(found.property), place } });
    } else {
      router.push({ pathname, params: { draft: JSON.stringify(found.draft), label: found.draft.addressLine, place } });
    }
  }

  async function startNote() {
    if (found.kind !== 'existing') return go();
    // A home you've toured before: say so before adding another visit.
    try {
      const { data } = await fetchProperty(found.property.id);
      const visits = data.visits.filter((v) => v.status !== 'failed');
      if (visits.length === 0) return go();
      setRevisit({ count: visits.length, last: visits[0]?.recorded_at ?? null });
    } catch {
      go();
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
          <PriceLine home={facts} />
          <FactsRow home={facts} />
          <PropertyDetails home={facts} />
          <SourceLine home={facts} />
        </View>
      </View>

      <View style={s.actions}>
        <View style={s.capture} accessibilityRole="radiogroup">
          <CaptureOption icon="mic" label="Voice" selected={mode === 'record'} onPress={() => pick('record')} />
          <CaptureOption icon="keyboard" label="Type" selected={mode === 'type'} onPress={() => pick('type')} />
        </View>
        <Button title="Start note" onPress={() => void startNote()} style={s.startNote} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/tour/pick')} style={s.change}>
          <Text style={s.changeText}>Change location</Text>
        </Pressable>
        {isSaved ? <Text style={s.together}>One home. All your reactions, together.</Text> : null}
      </View>

      <DesignSheet
        visible={revisit !== null}
        layout="center"
        icon="arrow.counterclockwise"
        eyebrow="WELCOME BACK"
        title="Revisiting this home?"
        primaryLabel="Yes, add a visit"
        onPrimary={go}
        secondaryLabel="Different home or unit"
        secondaryAsLink
        onSecondary={() => {
          setRevisit(null);
          router.push('/tour/pick');
        }}
      >
        <Text style={s.revisitAddress}>{address}</Text>
        <Text style={s.revisitMeta}>
          {revisit?.count} {revisit?.count === 1 ? 'visit' : 'visits'} saved
          {revisit?.last ? ` · Last visit ${longWhen(revisit.last)}` : ''}
        </Text>
        <Text style={s.revisitCopy}>
          This will be visit {(revisit?.count ?? 0) + 1}. NORA will combine your new reaction with your earlier notes. Each visit stays saved.
        </Text>
      </DesignSheet>
    </Animated.View>
  );
}

/** One half of the Voice / Type switch; the selected half is the white "slider". */
function CaptureOption({ icon, label, selected, onPress }: { icon: SFSymbol; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.captureOption, selected && s.captureSelected]}
    >
      <SymbolView name={icon} tintColor={selected ? colors.accent : '#6A778C'} size={16} type="monochrome" />
      <Text style={[s.captureText, { color: selected ? colors.accent : '#6A778C' }]}>{label}</Text>
    </Pressable>
  );
}

function longWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
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
  locEyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  locTitle: { fontFamily, fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 10 },
  locBody: { fontFamily, fontSize: 15, color: colors.ink2, marginTop: 8 },
  // Confirm stage
  confirm: { gap: 0 },
  foundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  foundPill: { backgroundColor: colors.goodSoft, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 9 },
  foundText: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.good },
  away: { fontFamily, fontSize: 12, color: colors.ink3 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' },
  photo: { width: '100%', height: 141, backgroundColor: '#E8EDF5' },
  previewChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(17,28,49,0.76)',
    borderRadius: 15,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  previewText: { fontFamily, fontSize: 12, fontWeight: '700', lineHeight: 15.6, color: '#FFFFFF' },
  cardBody: { paddingVertical: 10, paddingHorizontal: 12 },
  areYou: { fontFamily, fontSize: 12, fontWeight: '700', lineHeight: 15.6, letterSpacing: 1.56, color: colors.accent, marginBottom: 4 },
  address: { fontFamily, fontSize: 17, fontWeight: '700', lineHeight: 22, color: colors.ink },
  place: { fontFamily, fontSize: 12, lineHeight: 16.8, color: colors.ink3, marginTop: 3, marginBottom: 6 },
  actions: { paddingTop: 9, gap: 6 },
  capture: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: '#E8EDF5',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#DCE3ED',
  },
  captureOption: { flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  captureSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(24,44,75)',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  captureText: { fontFamily, fontSize: 15, fontWeight: '600' },
  startNote: { minHeight: 44 },
  change: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  changeText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  revisitAddress: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  revisitMeta: { fontFamily, fontSize: 12, color: colors.ink3, textAlign: 'center' },
  revisitCopy: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink2, textAlign: 'center', marginTop: 6, marginBottom: 4 },
  together: { fontFamily, fontSize: 12, color: colors.ink3, textAlign: 'center' },
});
