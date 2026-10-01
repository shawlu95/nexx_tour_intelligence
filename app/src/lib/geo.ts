// Address lookups with the phone's built-in geocoder (Apple on iOS; free, no key).
import * as Location from 'expo-location';
import { draftFromGeocode, geocodeQuery, samplePoints, uniqueStreetAddresses, type AddressDraft } from './address';
import { supabase } from './supabase';
import type { Property } from './types';

type Coords = { latitude: number; longitude: number };

/** The house's own coordinates, looked up from its street address. Null if not found. */
export async function geocodeAddress(d: Pick<AddressDraft, 'addressLine' | 'city' | 'region' | 'postalCode'>): Promise<Coords | null> {
  const query = geocodeQuery(d);
  if (!d.addressLine.trim()) return null;
  try {
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  } catch {
    return null;
  }
}

/**
 * Street addresses around the buyer, nearest first: reverse-geocodes their
 * position and a small ring around it, and keeps distinct house addresses.
 * Each draft's coordinates are the sampled point, close enough to rank by distance.
 */
export async function nearbyAddresses(here: Coords): Promise<AddressDraft[]> {
  const results = await Promise.all(
    samplePoints(here).map(async (p) => {
      try {
        const [g] = await Location.reverseGeocodeAsync(p);
        return g ? draftFromGeocode(g, p) : null;
      } catch {
        return null;
      }
    }),
  );
  return uniqueStreetAddresses(results.filter((d): d is AddressDraft => d !== null));
}

/**
 * Homes saved before addresses were geocoded carry the phone's position when they
 * were added (often down the street). Looks up their real coordinates and saves
 * them. Returns the properties with corrected coordinates; failures keep the old ones.
 */
export async function fixPropertyCoordinates(properties: Property[], limit = 10): Promise<Property[]> {
  const stale = properties.filter((p) => p.coords_source !== 'address').slice(0, limit);
  if (stale.length === 0) return properties;
  const fixed = new Map<string, Coords>();
  for (const p of stale) {
    const coords = await geocodeAddress({
      addressLine: p.unit ? `${p.address_line} Unit ${p.unit}` : p.address_line,
      city: p.city ?? '',
      region: p.region ?? '',
      postalCode: p.postal_code ?? '',
    });
    if (!coords) continue;
    const { error } = await supabase
      .from('properties')
      .update({ latitude: coords.latitude, longitude: coords.longitude, coords_source: 'address' })
      .eq('id', p.id);
    if (!error) fixed.set(p.id, coords);
  }
  return properties.map((p) => (fixed.has(p.id) ? { ...p, ...fixed.get(p.id)!, coords_source: 'address' as const } : p));
}
