// Reads and writes against Supabase. Reads fall back to the on-phone cache when offline.
import { cacheGet, cacheSet } from './localdb';
import { callFunction, supabase } from './supabase';
import type { ItemKind, Note, NoteItem, Property, ShareLink, Visit } from './types';

export interface VisitSummary extends Visit {
  properties: Pick<Property, 'address_line' | 'unit' | 'city'> | null;
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

const VISIT_SUMMARY = 'id, property_id, recorded_at, duration_seconds, audio_path, status, error, properties(address_line, unit, city), notes(overall)';

export function fetchRecentVisits(limit = 15): Promise<Cached<VisitSummary[]>> {
  return withCache('recent-visits', async () => {
    const { data, error } = await supabase
      .from('visits')
      .select(VISIT_SUMMARY)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as unknown as VisitSummary[];
  });
}

export function fetchProperties(): Promise<Cached<Property[]>> {
  return withCache('properties', async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('id, address_line, unit, city, region, postal_code, latitude, longitude, last_visited_at')
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
      supabase.from('notes').select('id, visit_id, overall, personal_note').eq('visit_id', id).maybeSingle(),
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

export async function updateItemText(itemId: string, text: string) {
  const { error } = await supabase.from('note_items').update({ text, edited: true }).eq('id', itemId);
  if (error) throw error;
}

export async function deleteItem(itemId: string) {
  const { error } = await supabase.from('note_items').update({ deleted: true }).eq('id', itemId);
  if (error) throw error;
}

export async function addItem(noteId: string, kind: ItemKind, text: string, sort: number): Promise<NoteItem> {
  const { data, error } = await supabase
    .from('note_items')
    .insert({ note_id: noteId, kind, text, origin: 'buyer', sort })
    .select('*')
    .single();
  if (error) throw error;
  return data as NoteItem;
}

export async function updatePersonalNote(noteId: string, personalNote: string) {
  const { error } = await supabase.from('notes').update({ personal_note: personalNote, edited_by_buyer: true }).eq('id', noteId);
  if (error) throw error;
}

// --- Audio ------------------------------------------------------------------

export async function signedAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('audio').createSignedUrl(path, 15 * 60);
  if (error || !data) throw error ?? new Error('Could not load the recording.');
  return data.signedUrl;
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

export async function deleteVisit(visit: Pick<Visit, 'id' | 'audio_path'>) {
  if (visit.audio_path) {
    const { error } = await supabase.storage.from('audio').remove([visit.audio_path]);
    if (error) throw error;
  }
  const { error } = await supabase.from('visits').delete().eq('id', visit.id);
  if (error) throw error;
}

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
