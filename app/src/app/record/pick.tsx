import * as Location from 'expo-location';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeThumb } from '../../components/HomeThumb';
import { Banner, Body, Button, colors, Eyebrow, Field, Screen } from '../../components/ui';
import {
  displayAddress,
  distanceMeters,
  EMPTY_DRAFT,
  formatDistance,
  normalizedKey,
  type AddressDraft,
} from '../../lib/address';
import { fetchProperties } from '../../lib/api';
import { formatHomeLine } from '../../lib/format';
import { fixPropertyCoordinates, nearbyAddresses } from '../../lib/geo';
import type { Property } from '../../lib/types';

const NEARBY_METERS = 800; // your saved homes within about half a mile
const MAX_OPTIONS = 6;
const PRESELECT_EXISTING_METERS = 80;

type Coords = { latitude: number; longitude: number };

/** One tappable choice: a home you've visited, or a street address found nearby. */
type Option =
  | { key: string; kind: 'existing'; property: Property; meters: number | null }
  | { key: string; kind: 'new'; draft: AddressDraft; meters: number | null };

type Selection = { kind: 'option'; key: string } | { kind: 'typed' };

function keyOfProperty(p: Property) {
  return normalizedKey({ addressLine: p.address_line, unit: p.unit ?? '', city: p.city ?? '' });
}

function distanceTo(here: Coords | null, p: { latitude: number | null; longitude: number | null }) {
  if (!here || p.latitude === null || p.longitude === null) return null;
  return distanceMeters(here, { latitude: p.latitude, longitude: p.longitude });
}

export default function PickHome() {
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState('');
  const [here, setHere] = useState<Coords | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [candidates, setCandidates] = useState<AddressDraft[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [now] = useState(() => new Date());
  // Height of what sits above this screen: status bar / Dynamic Island + the standard 44 pt nav bar.
  const headerHeight = useSafeAreaInsets().top + 44;

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

  // Your homes nearby first (distance to the house), then new street addresses nearby.
  const options = useMemo<Option[]>(() => {
    const existing = properties
      .map((p) => ({ key: `p:${p.id}`, kind: 'existing' as const, property: p, meters: distanceTo(here, p) }))
      .filter((o) => o.meters !== null && o.meters <= NEARBY_METERS)
      .sort((a, b) => a.meters! - b.meters!)
      .slice(0, 3);
    const known = new Set(properties.map(keyOfProperty));
    const fresh = candidates
      .filter((d) => !known.has(normalizedKey(d)))
      .map((d) => ({ key: `n:${normalizedKey(d)}`, kind: 'new' as const, draft: d, meters: distanceTo(here, d) }))
      .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    return [...existing, ...fresh].slice(0, MAX_OPTIONS);
  }, [properties, candidates, here]);

  // Default choice once options arrive: a saved home you're right next to, else the nearest address.
  const effective: Selection | null = useMemo(() => {
    if (selection) return selection;
    if (typing) return { kind: 'typed' };
    const closeExisting = options.find((o) => o.kind === 'existing' && (o.meters ?? Infinity) <= PRESELECT_EXISTING_METERS);
    const nearestNew = options.find((o) => o.kind === 'new');
    const pick = closeExisting ?? nearestNew ?? options[0];
    return pick ? { kind: 'option', key: pick.key } : null;
  }, [selection, typing, options]);

  const chosen = effective?.kind === 'option' ? (options.find((o) => o.key === effective.key) ?? null) : null;

  // A typed address that matches a saved home records against that home.
  const typedMatch = useMemo(() => {
    if (!draft.addressLine.trim()) return null;
    const key = normalizedKey(draft);
    return properties.find((p) => keyOfProperty(p) === key) ?? null;
  }, [draft, properties]);

  const canStart = effective?.kind === 'typed' ? draft.addressLine.trim().length >= 3 : !!chosen;

  function start() {
    let property: Property | null = null;
    let newDraft: AddressDraft | null = null;
    if (effective?.kind === 'typed') {
      if (typedMatch) property = typedMatch;
      else newDraft = { ...draft, addressLine: draft.addressLine.trim(), unit: draft.unit.trim(), city: draft.city.trim() };
    } else if (chosen?.kind === 'existing') {
      property = chosen.property;
    } else if (chosen?.kind === 'new') {
      newDraft = chosen.draft;
    }
    if (property) {
      router.push({ pathname: '/record/capture', params: { propertyId: property.id, label: displayAddress(property) } });
    } else if (newDraft) {
      router.push({
        pathname: '/record/capture',
        params: {
          draft: JSON.stringify(newDraft),
          label: displayAddress({ address_line: newDraft.addressLine, unit: newDraft.unit || null }),
        },
      });
    }
  }

  const set = (field: keyof AddressDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const addressForm = (
    <View style={s.form}>
      <Field
        label="Street address"
        value={draft.addressLine}
        onChangeText={set('addressLine')}
        placeholder="812 Pastoria Avenue"
        autoCapitalize="words"
        autoFocus
        returnKeyType="next"
      />
      <View style={s.row}>
        <View style={s.unit}>
          <Field label="Unit" value={draft.unit} onChangeText={set('unit')} placeholder="Optional" />
        </View>
        <View style={s.city}>
          <Field label="City" value={draft.city} onChangeText={set('city')} placeholder="Sunnyvale" autoCapitalize="words" />
        </View>
      </View>
      {typedMatch ? (
        <Banner tone="success">{"You've visited this home before. This reaction will be added to it."}</Banner>
      ) : null}
      {options.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setTyping(false);
            setSelection(null);
          }}
          hitSlop={8}
        >
          <Text style={s.typeLink}>Pick from nearby homes instead</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    // The page moves up with the keyboard, so the address fields and Start stay in view.
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <Screen style={s.screen}>
        <Stack.Screen options={{ title: '' }} />
        <View style={s.heading}>
          <Eyebrow>New reaction · {time}</Eyebrow>
          <Text style={s.title} accessibilityRole="header">
            Which home was this?
          </Text>
        </View>

        {locationNote ? <Banner>{locationNote}</Banner> : null}

        {typing ? (
          // Typing: the form takes the top of the page; the nearby list is hidden.
          addressForm
        ) : (
          <>
            {chosen ? <ChosenCard option={chosen} /> : null}

            {locating ? (
              <View style={s.locating}>
                <ActivityIndicator color={colors.accent} />
                <Text style={s.locatingText}>Finding homes near you…</Text>
              </View>
            ) : null}

            {options.length > 0 ? (
              <View style={s.options} accessibilityRole="radiogroup">
                {options.map((o) => (
                  <OptionRow
                    key={o.key}
                    option={o}
                    selected={effective?.kind === 'option' && effective.key === o.key}
                    onPress={() => setSelection({ kind: 'option', key: o.key })}
                  />
                ))}
              </View>
            ) : !locating ? (
              <Body muted>No addresses found nearby.</Body>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setTyping(true);
                setSelection({ kind: 'typed' });
              }}
              hitSlop={8}
            >
              <Text style={s.typeLink}>Not listed? Type the address</Text>
            </Pressable>
          </>
        )}

        <Button title="Start recording" disabled={!canStart} onPress={start} style={s.start} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ChosenCard({ option }: { option: Option }) {
  const home =
    option.kind === 'existing'
      ? option.property
      : { id: option.key, latitude: option.draft.latitude, longitude: option.draft.longitude };
  const title = option.kind === 'existing' ? displayAddress(option.property) : option.draft.addressLine;
  const facts = option.kind === 'existing' ? formatHomeLine(option.property) : '';
  const city = option.kind === 'existing' ? option.property.city : option.draft.city;
  return (
    <View style={s.chosen}>
      <HomeThumb home={home} size={88} />
      <View style={s.flex}>
        <Text style={s.chosenTitle} numberOfLines={2}>
          {title}
        </Text>
        {city ? <Text style={s.chosenMeta}>{city}</Text> : null}
        <Text style={s.chosenMeta}>
          {[option.kind === 'existing' ? 'Visited before' : 'New home', option.meters !== null ? formatDistance(option.meters) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {facts ? <Text style={s.chosenFacts}>{facts}</Text> : null}
      </View>
    </View>
  );
}

function OptionRow({ option, selected, onPress }: { option: Option; selected: boolean; onPress: () => void }) {
  const title = option.kind === 'existing' ? displayAddress(option.property) : option.draft.addressLine;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}${option.kind === 'existing' ? ', visited before' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [s.option, selected && s.optionSelected, pressed && { opacity: 0.85 }]}
    >
      <View style={[s.radio, selected && s.radioOn]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={s.flex}>
        <Text style={s.optionTitle} numberOfLines={1}>
          {title}
        </Text>
        {option.kind === 'existing' ? <Text style={s.optionTag}>Visited before</Text> : null}
      </View>
      {option.meters !== null ? <Text style={s.optionDistance}>{formatDistance(option.meters)}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { gap: 20 },
  flex: { flex: 1 },
  heading: { gap: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  chosen: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  chosenTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, lineHeight: 24 },
  chosenMeta: { fontSize: 14, color: colors.ink3, marginTop: 2 },
  chosenFacts: { fontSize: 14, color: colors.ink2, fontWeight: '600', marginTop: 6 },
  locating: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locatingText: { color: colors.ink3, fontSize: 15 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  optionTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  optionTag: { fontSize: 13, color: colors.accent, marginTop: 2 },
  optionDistance: { fontSize: 13, color: colors.ink3, fontVariant: ['tabular-nums'] },
  typeLink: { fontSize: 15, fontWeight: '600', color: colors.accent },
  form: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  unit: { flex: 1 },
  city: { flex: 2 },
  start: { marginTop: 'auto' },
});
