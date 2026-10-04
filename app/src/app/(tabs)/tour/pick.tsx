// Change location, recreated from the mockup: nearby addresses to tap (the one
// already suggested is left out), and "Not listed? Type the address" at the bottom.
// Choosing a home returns to the confirm card (tour/locate).
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { TourSearchHeader } from '../../../components/TourSearchHeader';
import { Banner, Body, Button, colors, Field, fontFamily, Screen, TabHeader } from '../../../components/ui';
import { aboutDistance, displayAddress, distanceMeters, EMPTY_DRAFT, normalizedKey, type AddressDraft } from '../../../lib/address';
import { fetchProperties, fetchTourSummary, type TourSummary } from '../../../lib/api';
import { startOfWeek } from '../../../lib/format';
import { fixPropertyCoordinates, geocodeAddress, nearbyAddresses } from '../../../lib/geo';
import { getSuggested, pickHome, type HomeChoice } from '../../../lib/homeChoice';
import type { Property } from '../../../lib/types';

const NEARBY_METERS = 800; // your saved homes within about half a mile
const MAX_OPTIONS = 6;

type Coords = { latitude: number; longitude: number };

function keyOfProperty(p: Property) {
  return normalizedKey({ addressLine: p.address_line, unit: p.unit ?? '', city: p.city ?? '' });
}

function keyOfChoice(c: HomeChoice | null): string | null {
  if (!c) return null;
  return c.kind === 'existing' ? keyOfProperty(c.property) : normalizedKey(c.draft);
}

function distanceTo(here: Coords | null, p: { latitude: number | null; longitude: number | null }) {
  if (!here || p.latitude === null || p.longitude === null) return null;
  return distanceMeters(here, { latitude: p.latitude, longitude: p.longitude });
}

/** Sends the chosen home to the confirm card: back to it, or open it if this screen replaced it. */
function choose(choice: HomeChoice) {
  pickHome(choice);
  if (getSuggested() && router.canGoBack()) router.back();
  else router.replace('/tour/locate');
}

export default function ChangeLocation() {
  const [summary, setSummary] = useState<TourSummary | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState('');
  const [here, setHere] = useState<Coords | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [candidates, setCandidates] = useState<AddressDraft[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [suggestedKey] = useState(() => keyOfChoice(getSuggested()));

  useEffect(() => {
    fetchTourSummary(startOfWeek())
      .then((r) => setSummary(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const props = await fetchProperties()
        .then((r) => r.data)
        .catch(() => [] as Property[]);
      if (cancelled) return;
      setProperties(props);
      // Correct homes saved with the phone's position instead of the house's (best effort).
      void fixPropertyCoordinates(props).then((fixed) => !cancelled && setProperties(fixed));
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationNote('Location is off, so type the address.');
          setTyping(true);
          return;
        }
        const pos =
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (cancelled) return;
        setHere(coords);
        const found = await nearbyAddresses(coords);
        if (!cancelled) setCandidates(found);
      } catch {
        if (!cancelled) {
          setLocationNote("Couldn't get your location, so type the address.");
          setTyping(true);
        }
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Your saved homes nearby first, then street addresses; the suggested home is left out.
  const options = useMemo<HomeChoice[]>(() => {
    const existing: HomeChoice[] = properties
      .map((p) => ({ kind: 'existing' as const, property: p, meters: distanceTo(here, p) }))
      .filter((o) => o.meters !== null && o.meters <= NEARBY_METERS)
      .sort((a, b) => a.meters! - b.meters!)
      .slice(0, 3);
    const known = new Set(properties.map(keyOfProperty));
    const fresh: HomeChoice[] = candidates
      .filter((d) => !known.has(normalizedKey(d)))
      .map((d) => ({ kind: 'new' as const, draft: d, meters: distanceTo(here, d) }))
      .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    return [...existing, ...fresh].filter((o) => keyOfChoice(o) !== suggestedKey).slice(0, MAX_OPTIONS);
  }, [properties, candidates, here, suggestedKey]);

  // A typed address that matches a saved home records against that home.
  const typedMatch = useMemo(() => {
    if (!draft.addressLine.trim()) return null;
    const key = normalizedKey(draft);
    return properties.find((p) => keyOfProperty(p) === key) ?? null;
  }, [draft, properties]);

  async function useTyped() {
    if (typedMatch) return choose({ kind: 'existing', property: typedMatch, meters: distanceTo(here, typedMatch) });
    setSaving(true);
    const clean = { ...draft, addressLine: draft.addressLine.trim(), unit: draft.unit.trim(), city: draft.city.trim() };
    const house = await geocodeAddress(clean);
    const located = house ? { ...clean, latitude: house.latitude, longitude: house.longitude } : clean;
    setSaving(false);
    choose({ kind: 'new', draft: located, meters: distanceTo(here, located) });
  }

  const set = (field: keyof AddressDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  return (
    // The page moves up with the keyboard so the address fields stay in view.
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tab style={s.screen}>
        <TabHeader />
        <TourSearchHeader summary={summary} />

        <Pressable accessibilityRole="link" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <SymbolView name="chevron.left" tintColor={colors.ink2} size={12} type="monochrome" />
          <Text style={s.backText}>Back</Text>
        </Pressable>

        <View style={s.heading}>
          <Text style={s.eyebrow}>CHANGE LOCATION</Text>
          <Text style={s.title} accessibilityRole="header">
            Which home are you visiting?
          </Text>
          <Text style={s.body}>Choose a nearby address. Search only if you don’t see it.</Text>
        </View>

        {locationNote ? <Banner>{locationNote}</Banner> : null}

        {typing ? (
          <View style={s.form}>
            <Field
              label="Street address"
              value={draft.addressLine}
              onChangeText={set('addressLine')}
              placeholder="Start typing an address"
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
            />
            <View style={s.row}>
              <View style={s.unit}>
                <Field label="Unit" value={draft.unit} onChangeText={set('unit')} placeholder="Optional" />
              </View>
              <View style={s.city}>
                <Field label="City" value={draft.city} onChangeText={set('city')} placeholder="City" autoCapitalize="words" />
              </View>
            </View>
            {typedMatch ? <Banner tone="success">{"You've visited this home before. This reaction will be added to it."}</Banner> : null}
            <Button title="Use this address" onPress={useTyped} loading={saving} disabled={draft.addressLine.trim().length < 3} />
            {options.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => setTyping(false)} hitSlop={8}>
                <Text style={s.link}>Choose from nearby addresses instead</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            {locating ? (
              <View style={s.locating}>
                <ActivityIndicator color={colors.accent} />
                <Text style={s.locatingText}>Finding homes near you…</Text>
              </View>
            ) : null}

            {options.length > 0 ? (
              <View style={s.options}>
                {options.map((o) => (
                  <OptionRow key={keyOfChoice(o)!} option={o} onPress={() => choose(o)} />
                ))}
              </View>
            ) : !locating ? (
              <Body muted>No other addresses found nearby.</Body>
            ) : null}

            <Pressable accessibilityRole="button" onPress={() => setTyping(true)} hitSlop={8} style={s.notListed}>
              <Text style={s.link}>Not listed? Type the address</Text>
            </Pressable>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function OptionRow({ option, onPress }: { option: HomeChoice; onPress: () => void }) {
  const title = option.kind === 'existing' ? displayAddress(option.property) : option.draft.addressLine;
  const detail = [option.meters !== null ? aboutDistance(option.meters) : null, option.kind === 'existing' ? 'Visited before' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [s.option, pressed && s.optionPressed]}
    >
      <Text style={s.optionTitle} numberOfLines={1}>
        {title}
      </Text>
      {detail ? <Text style={s.optionDetail}>{detail}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: { fontFamily, fontSize: 15, fontWeight: '600', color: colors.ink2 },
  heading: { gap: 8 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  body: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink2 },
  locating: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locatingText: { color: colors.ink3, fontFamily, fontSize: 15 },
  options: { gap: 10 },
  option: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionPressed: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionTitle: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
  optionDetail: { fontFamily, fontSize: 15, color: colors.ink2 },
  notListed: { alignSelf: 'center', paddingVertical: 6 },
  link: { fontFamily, fontSize: 15, fontWeight: '600', color: colors.accent, textAlign: 'center' },
  form: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  unit: { flex: 1 },
  city: { flex: 2 },
});
