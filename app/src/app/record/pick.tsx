import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, colors, Eyebrow, Field, Screen } from '../../components/ui';
import {
  displayAddress,
  distanceMeters,
  draftFromGeocode,
  EMPTY_DRAFT,
  formatDistance,
  normalizedKey,
  type AddressDraft,
} from '../../lib/address';
import { fetchProperties } from '../../lib/api';
import type { Property } from '../../lib/types';

const NEARBY_METERS = 500;

type Choice = { kind: 'existing'; property: Property } | { kind: 'new' };

export default function PickHome() {
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState('');
  const [here, setHere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [properties, setProperties] = useState<Property[]>([]);
  const [choice, setChoice] = useState<Choice>({ kind: 'new' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const props = await fetchProperties().then((r) => r.data).catch(() => [] as Property[]);
      if (!cancelled) setProperties(props);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationNote('Location is off, so type the address below.');
          return;
        }
        const pos =
          (await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        if (cancelled) return;
        setHere(coords);
        const [geo] = await Location.reverseGeocodeAsync(coords).catch(() => []);
        if (geo && !cancelled) setDraft(draftFromGeocode(geo, coords));
        // Pre-select one of the buyer's own homes if they're right next to it.
        const nearest = props
          .filter((p) => p.latitude !== null && p.longitude !== null)
          .map((p) => ({ p, d: distanceMeters(coords, { latitude: p.latitude!, longitude: p.longitude! }) }))
          .sort((a, b) => a.d - b.d)[0];
        if (nearest && nearest.d < 60 && !cancelled) setChoice({ kind: 'existing', property: nearest.p });
      } catch {
        if (!cancelled) setLocationNote("Couldn't get your location. Type the address below.");
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nearby = useMemo(() => {
    if (!here) return [];
    return properties
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((p) => ({ property: p, meters: distanceMeters(here, { latitude: p.latitude!, longitude: p.longitude! }) }))
      .filter((x) => x.meters <= NEARBY_METERS)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 4);
  }, [here, properties]);

  // If the typed address matches a home already saved, record against that home.
  const typedMatch = useMemo(() => {
    if (!draft.addressLine.trim()) return null;
    const key = normalizedKey(draft);
    return (
      properties.find(
        (p) => normalizedKey({ addressLine: p.address_line, unit: p.unit ?? '', city: p.city ?? '' }) === key,
      ) ?? null
    );
  }, [draft, properties]);

  const canStart = choice.kind === 'existing' || draft.addressLine.trim().length >= 3;

  function start() {
    if (choice.kind === 'existing' || typedMatch) {
      const property = choice.kind === 'existing' ? choice.property : typedMatch!;
      router.push({
        pathname: '/record/capture',
        params: { propertyId: property.id, label: displayAddress(property) },
      });
      return;
    }
    const clean = { ...draft, addressLine: draft.addressLine.trim(), unit: draft.unit.trim(), city: draft.city.trim() };
    router.push({
      pathname: '/record/capture',
      params: {
        draft: JSON.stringify(clean),
        label: displayAddress({ address_line: clean.addressLine, unit: clean.unit || null }),
      },
    });
  }

  const set = (field: keyof AddressDraft) => (value: string) => {
    setChoice({ kind: 'new' });
    setDraft((d) => ({ ...d, [field]: value }));
  };

  return (
    <Screen>
      <Body>Pick the home you just visited, or type its address.</Body>

      {locating ? (
        <View style={s.locating}>
          <ActivityIndicator color={colors.accent} />
          <Text style={s.locatingText}>Finding nearby addresses…</Text>
        </View>
      ) : null}
      {locationNote ? <Banner>{locationNote}</Banner> : null}

      {nearby.length > 0 && (
        <View style={s.group}>
          <Eyebrow>Your homes nearby</Eyebrow>
          {nearby.map(({ property, meters }) => {
            const selected = choice.kind === 'existing' && choice.property.id === property.id;
            return (
              <Option
                key={property.id}
                selected={selected}
                title={displayAddress(property)}
                detail={`Visited before · ${formatDistance(meters)}`}
                onPress={() => setChoice({ kind: 'existing', property })}
              />
            );
          })}
        </View>
      )}

      <View style={s.group}>
        <Eyebrow>{nearby.length > 0 ? 'Or a new home' : 'Address'}</Eyebrow>
        <Field
          label="Street address"
          value={draft.addressLine}
          onChangeText={set('addressLine')}
          onFocus={() => setChoice({ kind: 'new' })}
          placeholder="812 Pastoria Avenue"
          autoCapitalize="words"
        />
        <View style={s.row}>
          <View style={s.unit}>
            <Field label="Unit" value={draft.unit} onChangeText={set('unit')} placeholder="Optional" />
          </View>
          <View style={s.city}>
            <Field label="City" value={draft.city} onChangeText={set('city')} placeholder="Sunnyvale" autoCapitalize="words" />
          </View>
        </View>
        {choice.kind === 'new' && typedMatch ? (
          <Banner tone="success">{"You've visited this home before. This reaction will be added to it."}</Banner>
        ) : null}
      </View>

      <Button title="Start recording" disabled={!canStart} onPress={start} style={{ marginTop: 'auto' }} />
    </Screen>
  );
}

function Option({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.option, selected && s.optionSelected]}
    >
      <Text style={s.optionTitle}>{title}</Text>
      <Text style={s.optionDetail}>{detail}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  locating: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locatingText: { color: colors.ink3, fontSize: 15 },
  group: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  unit: { flex: 1 },
  city: { flex: 2 },
  option: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 2 },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  optionDetail: { fontSize: 13, color: colors.ink3 },
});
