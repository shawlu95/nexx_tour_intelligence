// Pure helpers for Google Places (New): address autocomplete and the chosen
// address's parts. No runtime imports, so they can be unit-tested.

export interface PlaceSuggestion {
  placeId: string;
  /** "812 Pastoria Avenue" */
  main: string;
  /** "Sunnyvale, CA, USA" */
  secondary: string;
}

/** The address fields NORA keeps for a home (same shape as the app's AddressDraft). */
export interface PlaceAddress {
  addressLine: string;
  unit: string;
  city: string;
  region: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

interface RawPrediction {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
}

export function suggestionsFrom(json: { suggestions?: RawPrediction[] } | null): PlaceSuggestion[] {
  return (json?.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p?.placeId) return [];
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? '';
    if (!main) return [];
    return [{ placeId: p.placeId, main, secondary: p.structuredFormat?.secondaryText?.text ?? '' }];
  });
}

interface RawComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/** Street line, unit, city, state and ZIP from a Place Details response. */
export function addressFrom(json: {
  addressComponents?: RawComponent[];
  location?: { latitude?: number; longitude?: number };
} | null): PlaceAddress | null {
  const parts = json?.addressComponents ?? [];
  const get = (type: string, short = false) => {
    const c = parts.find((p) => p.types?.includes(type));
    return ((short ? c?.shortText : c?.longText) ?? c?.longText ?? '').trim();
  };
  const addressLine = [get('street_number'), get('route')].filter(Boolean).join(' ');
  if (!addressLine) return null;
  const lat = json?.location?.latitude;
  const lng = json?.location?.longitude;
  return {
    addressLine,
    unit: get('subpremise'),
    city: get('locality') || get('postal_town') || get('sublocality') || get('administrative_area_level_2'),
    region: get('administrative_area_level_1', true),
    postalCode: get('postal_code'),
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lng === 'number' ? lng : null,
  };
}
