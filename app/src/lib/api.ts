// Reads and writes against Supabase. Reads fall back to the on-phone cache when offline.
import { cacheGet, cacheSet } from './localdb';
import { callFunction, supabase } from './supabase';
import type { Note, NoteItem, Property, ShareLink, Visit } from './types';

export type PropertyCard = Pick<
  Property,
  | 'id'
  | 'address_line'
  | 'unit'
  | 'city'
  | 'latitude'
  | 'longitude'
  | 'beds'
  | 'baths'
  | 'sqft'
  | 'price'
  | 'price_kind'
  | 'price_date'
  | 'listing_status'
  | 'property_type'
  | 'year_built'
  | 'lot_sqft'
  | 'parking'
  | 'hoa_fee'
>;

export interface VisitSummary extends Visit {
  properties: PropertyCard | null;
  notes: Pick<Note, 'overall'> | null;
}

export interface VisitDetail {
  visit: Visit;
  property: Property;
  note: Note | null;
  items: NoteItem[];
  transcript: string | null;
}

export interface Cached<T> {
  data: T;
  offline: boolean;
}

/** Runs a query; on failure returns the last cached result (marked offline) or rethrows. */
async function withCache<T>(key: string, load: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await load();
    await cacheSet(key, data);
    return { data, offline: false };
  } catch (e) {
    const cached = await cacheGet<T>(key);
    if (cached !== null) return { data: cached, offline: true };
    throw e;
  }
}

const PROPERTY_CARD =
  'id, address_line, unit, city, latitude, longitude, beds, baths, sqft, price, price_kind, price_date, listing_status, property_type, year_built, lot_sqft, parking, hoa_fee';
const VISIT_SUMMARY = `id, property_id, recorded_at, duration_seconds, audio_path, status, error, properties(${PROPERTY_CARD}), notes(overall)`;

export function fetchProperties(): Promise<Cached<Property[]>> {
  return withCache('properties', async () => {
    const { data, error } = await supabase
      .from('properties')
      .select(`${PROPERTY_CARD}, region, postal_code, last_visited_at, facts_status, coords_source`)
      .order('last_visited_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data as Property[];
  });
}

export function fetchProperty(id: string): Promise<Cached<{ property: Property; visits: VisitSummary[] }>> {
  return withCache(`property:${id}`, async () => {
    const [p, v] = await Promise.all([
      supabase.from('properties').select('*').eq('id', id).single(),
      supabase.from('visits').select(VISIT_SUMMARY).eq('property_id', id).order('recorded_at', { ascending: false }),
    ]);
    if (p.error) throw p.error;
    if (v.error) throw v.error;
    return { property: p.data as Property, visits: v.data as unknown as VisitSummary[] };
  });
}

export function fetchVisit(id: string): Promise<Cached<VisitDetail | null>> {
  return withCache(`visit:${id}`, async () => {
    const { data: visit, error } = await supabase
      .from('visits')
      .select('id, property_id, recorded_at, duration_seconds, audio_path, status, error, properties(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!visit) return null;
    const [n, t] = await Promise.all([
      supabase.from('notes').select('id, visit_id, overall, personal_note, clarify, clarify_answer').eq('visit_id', id).maybeSingle(),
      supabase.from('transcripts').select('full_text').eq('visit_id', id).maybeSingle(),
    ]);
    if (n.error) throw n.error;
    let items: NoteItem[] = [];
    if (n.data) {
      const i = await supabase
        .from('note_items')
        .select('*')
        .eq('note_id', n.data.id)
        .eq('deleted', false)
        .order('sort')
        .order('created_at');
      if (i.error) throw i.error;
      items = i.data as NoteItem[];
    }
    const { properties, ...rest } = visit as unknown as Visit & { properties: Property };
    return {
      visit: rest,
      property: properties,
      note: (n.data as Note | null) ?? null,
      items,
      transcript: (t.data?.full_text as string | undefined) ?? null,
    };
  });
}

export async function retryVisit(visitId: string, regenerate = false) {
  await callFunction('process-visit', { visit_id: visitId, regenerate });
}

// --- Note edits -------------------------------------------------------------

/** Saves the buyer's answer to the note's follow-up question ('skipped' to dismiss it). */
export async function answerClarify(noteId: string, answer: string) {
  const { error } = await supabase
    .from('notes')
    .update({ clarify_answer: answer, clarify_answered_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw error;
}

// --- Sharing ----------------------------------------------------------------

export async function listShareLinks(noteId: string): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from('share_links')
    .select('id, token, include_transcript, created_at, expires_at, revoked_at, view_count')
    .eq('note_id', noteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ShareLink[];
}

export async function createShareLink(noteId: string, includeTranscript: boolean): Promise<ShareLink> {
  const { data, error } = await supabase
    .from('share_links')
    .insert({ note_id: noteId, include_transcript: includeTranscript })
    .select('id, token, include_transcript, created_at, expires_at, revoked_at, view_count')
    .single();
  if (error) throw error;
  return data as ShareLink;
}

export async function revokeShareLink(linkId: string) {
  const { error } = await supabase.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', linkId);
  if (error) throw error;
}

// --- Deleting ---------------------------------------------------------------

export async function deleteProperty(propertyId: string) {
  const { data, error } = await supabase.from('visits').select('audio_path').eq('property_id', propertyId);
  if (error) throw error;
  const paths = (data ?? []).map((v) => v.audio_path as string | null).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmError } = await supabase.storage.from('audio').remove(paths);
    if (rmError) throw rmError;
  }
  const { error: dError } = await supabase.from('properties').delete().eq('id', propertyId);
  if (dError) throw dError;
}

export async function deleteAccount() {
  await callFunction('delete-account', {});
}

// --- Tour page summary -------------------------------------------------------

export interface TourSummary {
  /** Homes with at least one recorded visit. */
  toured: number;
  /** Homes visited since Monday. */
  thisWeek: number;
  /** NORA's latest score (0–10) for each home, by property id. */
  scores: Record<string, number>;
}

export function fetchTourSummary(weekStart: Date): Promise<Cached<TourSummary>> {
  return withCache('tour-summary', async () => {
    const [toured, week, latest] = await Promise.all([
      supabase.from('properties').select('id', { count: 'exact', head: true }).not('last_visited_at', 'is', null),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .gte('last_visited_at', weekStart.toISOString()),
      supabase
        .from('ranking_messages')
        .select('ranking')
        .eq('role', 'assistant')
        .not('ranking', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (toured.error) throw toured.error;
    if (week.error) throw week.error;
    const scores: Record<string, number> = {};
    for (const r of ((latest.data?.ranking ?? []) as { property_id: string; score?: number }[])) {
      if (typeof r.score === 'number') scores[r.property_id] = r.score;
    }
    return { toured: toured.count ?? 0, thisWeek: week.count ?? 0, scores };
  });
}
