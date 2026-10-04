// Ranking conversation: reads the saved conversation and sends the buyer's turns
// to the rank-homes function, which answers with a new ranking.
import { fetchProperties, type PropertyCard } from './api';
import { cacheGet, cacheSet } from './localdb';
import type { Priority, RankingMessage } from './rankingLogic';
import { callFunction, supabase } from './supabase';

export * from './rankingLogic';

export interface RankingState {
  messages: RankingMessage[];
  priorities: Priority[];
  /** The buyer's own drag-and-drop order (property ids), or null for NORA's order. */
  override: string[] | null;
  homes: Map<string, PropertyCard>;
  /** Homes with at least one finished note: the ones that can be ranked. */
  rankableIds: string[];
  /** Each home's latest reaction summary, by property id. */
  summaries: Record<string, string>;
  offline: boolean;
}

export async function fetchRankingState(): Promise<RankingState> {
  const homesResult = await fetchProperties();
  const homes = new Map(homesResult.data.map((p) => [p.id, p as PropertyCard]));
  try {
    const [m, p, v, o] = await Promise.all([
      supabase
        .from('ranking_messages')
        .select('id, role, content, ranking, question, suggestions, based_on, created_at')
        .order('created_at', { ascending: true })
        .limit(200),
      supabase.from('buyer_priorities').select('priorities').maybeSingle(),
      supabase.from('visits').select('property_id, notes(overall)').eq('status', 'ready').order('recorded_at', { ascending: false }),
      supabase.from('ranking_overrides').select('property_ids').maybeSingle(),
    ]);
    if (m.error) throw m.error;
    if (v.error) throw v.error;
    const summaries: Record<string, string> = {};
    for (const r of (v.data ?? []) as unknown as { property_id: string; notes: { overall: string } | { overall: string }[] | null }[]) {
      const note = Array.isArray(r.notes) ? r.notes[0] : r.notes;
      if (note?.overall && !summaries[r.property_id]) summaries[r.property_id] = note.overall;
    }
    const state = {
      summaries,
      messages: (m.data ?? []) as RankingMessage[],
      priorities: (p.data?.priorities ?? []) as Priority[],
      rankableIds: [...new Set((v.data ?? []).map((r) => r.property_id as string))],
      override: ((o.data?.property_ids as string[] | undefined) ?? null) || null,
    };
    await cacheSet('ranking', state);
    return { ...state, homes, offline: homesResult.offline };
  } catch (e) {
    const cached = await cacheGet<Omit<RankingState, 'homes' | 'offline'>>('ranking');
    if (cached) return { ...cached, homes, offline: true };
    throw e;
  }
}

/** 'rank' re-ranks every home with the current preferences; 'chat' is a Discuss turn (no re-rank). */
export async function sendRankingTurn(
  action: 'rank' | 'chat',
  message?: string,
): Promise<{ messages: RankingMessage[]; priorities: Priority[] }> {
  return callFunction('rank-homes', { action, message });
}

/** Saves the buyer's own order of their homes (property ids, best first). */
export async function saveOverride(order: string[]) {
  const { error } = await supabase
    .from('ranking_overrides')
    .upsert({ property_ids: order, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Goes back to NORA's order. */
export async function clearOverride() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in again to continue.');
  const { error } = await supabase.from('ranking_overrides').delete().eq('user_id', userId);
  if (error) throw error;
}
