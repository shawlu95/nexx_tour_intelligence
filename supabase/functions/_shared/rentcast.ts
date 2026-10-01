// Looks up beds, baths, square feet and price for a home with RentCast, once per
// property, within a hard monthly call cap (the free plan charges $0.20 per call
// over 50/month).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import {
  asArray,
  buildAddressQuery,
  factsFromListing,
  factsFromRecord,
  hasFacts,
  isAreaQuery,
  mergeFacts,
  pickMatch,
  type Facts,
  type PropertyRow,
  type RentcastListing,
  type RentcastRecord,
} from './facts.ts';

const BASE = 'https://api.rentcast.io/v1';
const RETRY_ERRORS_AFTER_MS = 24 * 60 * 60 * 1000;

class CapReached extends Error {}

interface StoredProperty extends PropertyRow {
  id: string;
  facts_status: 'pending' | 'found' | 'not_found' | 'error';
  facts_fetched_at: string | null;
}

/** Whether a property should be looked up now. */
export function needsLookup(p: Pick<StoredProperty, 'facts_status' | 'facts_fetched_at'>): boolean {
  if (p.facts_status === 'pending') return true;
  if (p.facts_status !== 'error') return false;
  return !p.facts_fetched_at || Date.now() - new Date(p.facts_fetched_at).getTime() > RETRY_ERRORS_AFTER_MS;
}

async function call<T>(db: SupabaseClient, path: string, query: Record<string, string>): Promise<T[]> {
  const key = Deno.env.get('RENTCAST_API_KEY');
  if (!key) throw new Error('RENTCAST_API_KEY is not set');
  const limit = Number(Deno.env.get('RENTCAST_MONTHLY_LIMIT') ?? '45');
  const { data: allowed, error } = await db.rpc('claim_api_call', { p_provider: 'rentcast', p_monthly_limit: limit });
  if (error) throw error;
  if (allowed !== true) throw new CapReached(`RentCast monthly cap of ${limit} calls reached`);

  const res = await fetch(`${BASE}${path}?${new URLSearchParams({ ...query, limit: isAreaQuery(query) ? '10' : '1' })}`, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return []; // RentCast answers 404 when nothing matches
  if (!res.ok) throw new Error(`RentCast ${path} returned ${res.status}: ${await res.text()}`);
  return asArray<T>(await res.json());
}

function choose<T extends { formattedAddress?: string; addressLine1?: string }>(
  results: T[],
  query: Record<string, string>,
  addressLine: string,
): T | null {
  if (results.length === 0) return null;
  return isAreaQuery(query) ? pickMatch(results, addressLine) : results[0];
}

/**
 * Looks up and saves facts for one property. Best effort: never throws.
 * Costs one call when an active listing has beds, baths and square feet; otherwise two.
 */
export async function lookUpFacts(db: SupabaseClient, propertyId: string): Promise<void> {
  if (!Deno.env.get('RENTCAST_API_KEY')) return; // not configured yet: leave 'pending'
  try {
    const { data: p, error } = await db
      .from('properties')
      .select('id, address_line, unit, city, region, postal_code, latitude, longitude, facts_status, facts_fetched_at')
      .eq('id', propertyId)
      .maybeSingle();
    if (error) throw error;
    if (!p || !needsLookup(p as StoredProperty)) return;
    const property = p as StoredProperty;

    const query = buildAddressQuery(property);
    if (!query) {
      await save(db, propertyId, 'not_found', null);
      return;
    }

    const listing = choose(await call<RentcastListing>(db, '/listings/sale', { ...query, status: 'Active' }), query, property.address_line);
    let facts: Facts | null = listing ? factsFromListing(listing) : null;
    const complete = facts && facts.beds !== null && facts.baths !== null && facts.sqft !== null && facts.price !== null;
    if (!complete) {
      const record = choose(await call<RentcastRecord>(db, '/properties', query), query, property.address_line);
      facts = mergeFacts(facts, record ? factsFromRecord(record) : null);
    }

    await save(db, propertyId, facts && hasFacts(facts) ? 'found' : 'not_found', facts);
  } catch (e) {
    if (e instanceof CapReached) {
      console.warn(e.message, propertyId); // stays 'pending'; tried again next month
      return;
    }
    console.error('facts lookup failed', propertyId, e);
    await db
      .from('properties')
      .update({ facts_status: 'error', facts_fetched_at: new Date().toISOString() })
      .eq('id', propertyId)
      .then(() => undefined, () => undefined);
  }
}

async function save(db: SupabaseClient, id: string, status: 'found' | 'not_found', facts: Facts | null) {
  const { error } = await db
    .from('properties')
    .update({ ...(facts ?? {}), facts_status: status, facts_fetched_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
