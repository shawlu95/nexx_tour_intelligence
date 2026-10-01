// Address helpers: normalizing for de-duplication, distances, and display.
// Pure functions only, so they can be unit-tested.

export interface AddressDraft {
  addressLine: string; // "812 Pastoria Avenue"
  unit: string; // "" when none
  city: string;
  region: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

export const EMPTY_DRAFT: AddressDraft = {
  addressLine: '',
  unit: '',
  city: '',
  region: '',
  postalCode: '',
  latitude: null,
  longitude: null,
};

const STREET_SUFFIXES: Record<string, string> = {
  avenue: 'ave',
  av: 'ave',
  street: 'st',
  road: 'rd',
  drive: 'dr',
  court: 'ct',
  boulevard: 'blvd',
  lane: 'ln',
  place: 'pl',
  terrace: 'ter',
  circle: 'cir',
  parkway: 'pkwy',
  highway: 'hwy',
  way: 'way',
};

const DIRECTIONS: Record<string, string> = {
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
};

function normalizePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_SUFFIXES[w] ?? DIRECTIONS[w] ?? w)
    .join(' ');
}

/**
 * Key used to recognize the same home across visits: street line + unit + city,
 * with common spelling variants folded ("812 Pastoria Avenue" == "812 pastoria ave.").
 */
export function normalizedKey(draft: Pick<AddressDraft, 'addressLine' | 'unit' | 'city'>): string {
  const unit = draft.unit.replace(/^(unit|apt|apartment|suite|ste|#)\s*/i, '');
  return [normalizePart(draft.addressLine), normalizePart(unit), normalizePart(draft.city)].join('|');
}

/** Great-circle distance in meters. */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function displayAddress(p: { address_line: string; unit?: string | null }): string {
  return p.unit ? `${p.address_line}, Unit ${p.unit}` : p.address_line;
}

/** Shape returned by expo-location's reverseGeocodeAsync (only the fields we use). */
export interface GeocodedAddress {
  streetNumber?: string | null;
  street?: string | null;
  name?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  postalCode?: string | null;
}

export function draftFromGeocode(g: GeocodedAddress, coords: { latitude: number; longitude: number }): AddressDraft {
  const line =
    g.streetNumber && g.street ? `${g.streetNumber} ${g.street}` : (g.name ?? g.street ?? '').trim();
  return {
    addressLine: line,
    unit: '',
    city: g.city ?? g.subregion ?? '',
    region: g.region ?? '',
    postalCode: g.postalCode ?? '',
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}
