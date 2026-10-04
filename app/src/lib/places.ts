// Address search for Change Location: Google Places autocomplete through the
// `places` Edge Function (the Google key stays on the server). When it isn't
// available, the typed text is looked up with the phone's own geocoder instead.
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { draftFromGeocode, type AddressDraft } from './address';
import { callFunction } from './supabase';

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

/** One token per search: Google bills the typing and the final pick as one session. */
export function newSearchSession(): string {
  return Crypto.randomUUID();
}

export async function searchAddresses(
  input: string,
  sessionToken: string,
  near: { latitude: number; longitude: number } | null,
): Promise<PlaceSuggestion[]> {
  const result = await callFunction<{ suggestions: PlaceSuggestion[] }>('places', {
    action: 'autocomplete',
    input,
    sessionToken,
    ...(near ?? {}),
  });
  return result.suggestions;
}

export async function addressOf(placeId: string, sessionToken: string): Promise<AddressDraft> {
  const { address } = await callFunction<{ address: AddressDraft }>('places', { action: 'details', placeId, sessionToken });
  return address;
}

/** Fallback without Google: find the typed address with the phone's geocoder. */
export async function lookUpTyped(text: string): Promise<AddressDraft | null> {
  const [hit] = await Location.geocodeAsync(text).catch(() => []);
  if (!hit) return null;
  const coords = { latitude: hit.latitude, longitude: hit.longitude };
  const [place] = await Location.reverseGeocodeAsync(coords).catch(() => []);
  if (!place) return null;
  const draft = draftFromGeocode(place, coords);
  // Keep the street line as typed: the geocoder can land on the house next door.
  const typedLine = text.split(',')[0].trim();
  const addressLine = /^\d/.test(typedLine) ? typedLine : draft.addressLine;
  return addressLine ? { ...draft, addressLine } : null;
}

/**
 * Fallback suggestions without Google: up to `limit` addresses the phone's geocoder
 * finds for the typed text, as street line plus "City, ST ZIP".
 */
export async function suggestTyped(text: string, limit = 4): Promise<AddressDraft[]> {
  const hits = (await Location.geocodeAsync(text).catch(() => [])).slice(0, limit);
  const drafts = await Promise.all(
    hits.map(async (h) => {
      const coords = { latitude: h.latitude, longitude: h.longitude };
      const [place] = await Location.reverseGeocodeAsync(coords).catch(() => []);
      return place ? draftFromGeocode(place, coords) : null;
    }),
  );
  const seen = new Set<string>();
  return drafts.filter((d): d is AddressDraft => {
    if (!d?.addressLine) return false;
    const key = `${d.addressLine}|${d.city}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
