// Change location, from the mockup: the suggested home (checked) and nearby
// addresses to tap, then "Search or enter an address" with Google suggestions as
// you type. Choosing a home returns to the confirm card (tour/locate).
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Body, colors, fontFamily, Screen } from '../../../components/ui';
import { aboutDistance, displayAddress, distanceMeters, normalizedKey, type AddressDraft } from '../../../lib/address';
import { fetchProperties } from '../../../lib/api';
import { fixPropertyCoordinates, nearbyAddresses } from '../../../lib/geo';
import { getSuggested, pickHome, type HomeChoice } from '../../../lib/homeChoice';
import { addressOf, lookUpTyped, newSearchSession, searchAddresses, type PlaceSuggestion } from '../../../lib/places';
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
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState('');
  const [here, setHere] = useState<Coords | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [candidates, setCandidates] = useState<AddressDraft[]>([]);
  const [suggested] = useState(() => getSuggested());
  const suggestedKey = keyOfChoice(suggested);

  // "Search or enter an address": Google suggestions as you type, or the phone's
  // geocoder when Google isn't available.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [googleOff, setGoogleOff] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [searchError, setSearchError] = useState('');
  const session = useRef(newSearchSession());

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
          setLocationNote('Location is off, so search for the address.');
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
        if (!cancelled) setLocationNote("Couldn't get your location, so search for the address.");
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Suggestions a moment after typing stops.
  useEffect(() => {
    const text = query.trim();
    if (googleOff || text.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchAddresses(text, session.current, here);
        if (!cancelled) {
          setResults(found);
          setSearchError('');
        }
      } catch {
        // No key yet, or Google is down: fall back to the phone's geocoder.
        if (!cancelled) setGoogleOff(true);
      }
      if (!cancelled) setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, here, googleOff]);

  // The suggested home first (checked), then your saved homes nearby, then street addresses.
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
    const rest = [...existing, ...fresh].filter((o) => keyOfChoice(o) !== suggestedKey);
    return [...(suggested ? [suggested] : []), ...rest].slice(0, MAX_OPTIONS);
  }, [properties, candidates, here, suggested, suggestedKey]);

  /** A searched address: a home you've visited before records against that home. */
  function chooseAddress(draft: AddressDraft) {
    const match = properties.find((p) => keyOfProperty(p) === normalizedKey(draft));
    if (match) return choose({ kind: 'existing', property: match, meters: distanceTo(here, match) });
    choose({ kind: 'new', draft, meters: distanceTo(here, draft) });
  }

  async function pickSuggestion(r: PlaceSuggestion) {
    setPicking(r.placeId);
    setSearchError('');
    try {
      const draft = await addressOf(r.placeId, session.current);
      session.current = newSearchSession(); // the details call ends Google's session
      chooseAddress(draft);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Couldn't use that address. Try another.");
    }
    setPicking(null);
  }

  async function searchTyped() {
    setPicking('typed');
    setSearchError('');
    const draft = await lookUpTyped(query.trim());
    setPicking(null);
    if (!draft) return setSearchError('Couldn’t find that address. Add the city, or check the street number.');
    chooseAddress(draft);
  }

  const typed = query.trim().length >= 3;

  return (
    <Screen header style={s.screen}>
      <View style={s.heading}>
        <Text style={s.eyebrow}>CHANGE LOCATION</Text>
        <Text style={s.title} accessibilityRole="header">
          Which home are you visiting?
        </Text>
        <Text style={s.body}>Choose a nearby address. Search only if you don’t see it.</Text>
      </View>

      {locationNote ? <Banner>{locationNote}</Banner> : null}

      {locating ? (
        <View style={s.locating}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.locatingText}>Finding homes near you…</Text>
        </View>
      ) : null}

      {options.length > 0 ? (
        <View style={s.options}>
          {options.map((o) => (
            <OptionRow key={keyOfChoice(o)!} option={o} selected={keyOfChoice(o) === suggestedKey} onPress={() => choose(o)} />
          ))}
        </View>
      ) : !locating && !locationNote ? (
        <Body muted>No other addresses found nearby.</Body>
      ) : null}

      <View style={s.search}>
        <Text style={s.searchLabel}>Search or enter an address</Text>
        <TextInput
          accessibilityLabel="Search or enter an address"
          style={s.searchInput}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (t.trim().length < 3) setResults([]);
          }}
          placeholder="Start typing an address"
          placeholderTextColor="#8C95A6"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="fullStreetAddress"
          autoComplete="street-address"
          returnKeyType="search"
          clearButtonMode="while-editing"
          onSubmitEditing={() => (googleOff ? void searchTyped() : results[0] && void pickSuggestion(results[0]))}
        />

        {typed && !googleOff ? (
          <View style={s.results}>
            {results.map((r, i) => (
              <Pressable
                key={r.placeId}
                accessibilityRole="button"
                accessibilityLabel={`${r.main}, ${r.secondary}`}
                onPress={() => void pickSuggestion(r)}
                disabled={picking !== null}
                style={({ pressed }) => [s.result, i > 0 && s.resultDivider, pressed && { backgroundColor: colors.accentSoft }]}
              >
                <SymbolView name="mappin.circle" tintColor={colors.ink3} size={20} type="monochrome" />
                <View style={s.flex}>
                  <Text style={s.resultMain} numberOfLines={1}>
                    {r.main}
                  </Text>
                  {r.secondary ? (
                    <Text style={s.resultSecondary} numberOfLines={1}>
                      {r.secondary}
                    </Text>
                  ) : null}
                </View>
                {picking === r.placeId ? <ActivityIndicator color={colors.accent} /> : null}
              </Pressable>
            ))}
            {results.length === 0 ? (
              <Text style={s.resultNote}>{searching ? 'Searching…' : 'No matching addresses yet. Keep typing.'}</Text>
            ) : null}
          </View>
        ) : null}

        {typed && googleOff ? (
          <View style={s.results}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void searchTyped()}
              disabled={picking !== null}
              style={({ pressed }) => [s.result, pressed && { backgroundColor: colors.accentSoft }]}
            >
              <SymbolView name="magnifyingglass" tintColor={colors.ink3} size={18} type="monochrome" />
              <Text style={[s.resultMain, s.flex]} numberOfLines={2}>{`Use “${query.trim()}”`}</Text>
              {picking === 'typed' ? <ActivityIndicator color={colors.accent} /> : null}
            </Pressable>
          </View>
        ) : null}

        {searchError ? <Text style={s.searchError}>{searchError}</Text> : null}
      </View>
    </Screen>
  );
}

function OptionRow({ option, selected, onPress }: { option: HomeChoice; selected: boolean; onPress: () => void }) {
  const title = option.kind === 'existing' ? displayAddress(option.property) : option.draft.addressLine;
  const detail = [option.meters !== null ? aboutDistance(option.meters) : null, option.kind === 'existing' ? 'Visited before' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [s.option, (selected || pressed) && s.optionSelected]}
    >
      <View style={s.flex}>
        <Text style={s.optionTitle} numberOfLines={1}>
          {title}
        </Text>
        {detail ? <Text style={s.optionDetail}>{detail}</Text> : null}
      </View>
      {selected ? <SymbolView name="checkmark" tintColor={colors.accent} size={16} type="monochrome" weight="semibold" /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 18 },
  heading: { gap: 8 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  body: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink2 },
  locating: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locatingText: { color: colors.ink3, fontFamily, fontSize: 15 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: 'rgba(33,150,255,0.1)' },
  optionTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  optionDetail: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 3 },
  search: { gap: 8 },
  searchLabel: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink },
  searchInput: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    fontFamily,
    fontSize: 17,
    color: colors.ink,
  },
  results: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14 },
  resultDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  resultMain: { fontFamily, fontSize: 15, fontWeight: '600', color: colors.ink },
  resultSecondary: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 2 },
  resultNote: { fontFamily, fontSize: 13, color: colors.ink3, padding: 14 },
  searchError: { fontFamily, fontSize: 13, color: colors.bad },
});
