// Address search with Google Places (New), for "Search or enter an address" on
// Change Location. The Google key stays on the server (GOOGLE_MAPS_API_KEY).
//
// POST { action: 'autocomplete', input, sessionToken, latitude?, longitude? }
//   → { suggestions: [{ placeId, main, secondary }] }   US street addresses, near the buyer first
// POST { action: 'details', placeId, sessionToken }
//   → { address: { addressLine, unit, city, region, postalCode, latitude, longitude } }
//
// One sessionToken per search: Google bills the typing as one session that ends
// with the details call. Without a key the function answers 503 and the app
// falls back to looking up the typed text on the phone.
import { addressFrom, suggestionsFrom } from '../_shared/places.ts';
import { corsHeaders, json, userIdFrom } from '../_shared/runtime.ts';

const BASE = 'https://places.googleapis.com/v1';
const BIAS_METERS = 20_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await userIdFrom(req))) return json({ error: 'Sign in again to continue.' }, 401);
  const key = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!key) return json({ error: 'Address search is not set up.', code: 'not_configured' }, 503);

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    input?: string;
    placeId?: string;
    sessionToken?: string;
    latitude?: number;
    longitude?: number;
  };
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 64) : undefined;

  try {
    if (body.action === 'autocomplete') {
      const input = (body.input ?? '').trim().slice(0, 200);
      if (input.length < 3) return json({ suggestions: [] });
      const near =
        typeof body.latitude === 'number' && typeof body.longitude === 'number'
          ? { locationBias: { circle: { center: { latitude: body.latitude, longitude: body.longitude }, radius: BIAS_METERS } } }
          : {};
      const res = await fetch(`${BASE}/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({
          input,
          sessionToken,
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
          includedRegionCodes: ['us'],
          languageCode: 'en',
          ...near,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Places autocomplete returned ${res.status}: ${await res.text()}`);
      return json({ suggestions: suggestionsFrom(await res.json()).slice(0, 5) });
    }

    if (body.action === 'details') {
      if (!body.placeId || !/^[\w-]+$/.test(body.placeId)) return json({ error: 'placeId is required' }, 400);
      const params = new URLSearchParams({ languageCode: 'en', ...(sessionToken ? { sessionToken } : {}) });
      const res = await fetch(`${BASE}/places/${body.placeId}?${params}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'addressComponents,location' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Places details returned ${res.status}: ${await res.text()}`);
      const address = addressFrom(await res.json());
      if (!address) return json({ error: 'That place has no street address.' }, 422);
      return json({ address });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('places failed', e);
    return json({ error: "Address search isn't working right now. Type the full address instead." }, 502);
  }
});
