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
  homes: Map<string, PropertyCard>;
  /** Homes with at least one finished note: the ones that can be ranked. */
  rankableIds: string[];
  offline: boolean;
}

export async function fetchRankingState(): Promise<RankingState> {
  const homesResult = await fetchProperties();
  const homes = new Map(homesResult.data.map((p) => [p.id, p as PropertyCard]));
  try {
    const [m, p, v] = await Promise.all([
      supabase
        .from('ranking_messages')
        .select('id, role, content, ranking, question, suggestions, based_on, created_at')
        .order('created_at', { ascending: true })
        .limit(200),
      supabase.from('buyer_priorities').select('priorities').maybeSingle(),
      supabase.from('visits').select('property_id').eq('status', 'ready'),
    ]);
    if (m.error) throw m.error;
    if (v.error) throw v.error;
    const state = {
      messages: (m.data ?? []) as RankingMessage[],
      priorities: (p.data?.priorities ?? []) as Priority[],
      rankableIds: [...new Set((v.data ?? []).map((r) => r.property_id as string))],
    };
    await cacheSet('ranking', state);
    return { ...state, homes, offline: homesResult.offline };
  } catch (e) {
    const cached = await cacheGet<Omit<RankingState, 'homes' | 'offline'>>('ranking');
    if (cached) return { ...cached, homes, offline: true };
    throw e;
  }
}

export async function sendRankingTurn(
  action: 'start' | 'send' | 'refresh',
  message?: string,
): Promise<{ messages: RankingMessage[]; priorities: Priority[] }> {
  return callFunction('rank-homes', { action, message });
}

/** "Start over": forgets the conversation and what NORA learned. */
export async function resetRanking() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in again to continue.');
  const a = await supabase.from('ranking_messages').delete().eq('user_id', userId);
  if (a.error) throw a.error;
  const b = await supabase.from('buyer_priorities').delete().eq('user_id', userId);
  if (b.error) throw b.error;
}
