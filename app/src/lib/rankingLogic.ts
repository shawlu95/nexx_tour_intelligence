// Pure ranking types and helpers (no imports), so they can be unit-tested.

export type Fit = 'strong' | 'good' | 'weak';
export type Importance = 'must' | 'high' | 'medium' | 'low';

export interface RankedHome {
  property_id: string;
  rank: number;
  /** 0–10, one decimal: rough fit for comparing homes (close scores = close call). */
  score?: number;
  fit: Fit;
  /** 2–4 words, e.g. "Best overall fit". */
  label?: string;
  /** Short tags, at most 3 each. */
  pros?: string[];
  cons?: string[];
  /** Rankings saved before labels existed carry a sentence here instead. */
  reason?: string;
  /** One short sentence on what most affects the fit ("Power-line impact needs research."). */
  note?: string;
}

export interface Priority {
  label: string;
  importance: Importance;
  evidence: string;
}

export interface RankingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ranking: RankedHome[] | null;
  question: string | null;
  /** One-tap replies NORA offered, in the buyer's voice. */
  suggestions?: string[] | null;
  based_on: string[] | null;
  created_at: string;
}

/** The most recent ranking in the conversation, if any. */
export function latestRanking(messages: RankingMessage[]): RankingMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].ranking?.length) return messages[i];
  }
  return null;
}

/** Rankable homes the latest ranking didn't include yet. */
export function newHomesSince(latest: RankingMessage | null, rankableIds: string[]): string[] {
  if (!latest) return [];
  const seen = new Set(latest.based_on ?? latest.ranking?.map((r) => r.property_id) ?? []);
  return rankableIds.filter((id) => !seen.has(id));
}

/** True when the buyer has discussed with NORA since the latest ranking (so a re-rank would use new preferences). */
export function discussedSinceRanking(messages: RankingMessage[]): boolean {
  const latest = latestRanking(messages);
  if (!latest) return false;
  const after = messages.slice(messages.indexOf(latest) + 1);
  return after.some((m) => m.role === 'user');
}

/** The short label for a ranked home, falling back to the first words of an older reason. */
export function shortLabel(r: RankedHome): string {
  if (r.label?.trim()) return r.label.trim();
  const words = (r.reason ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.length > 4 ? `${words.slice(0, 4).join(' ')}…` : words.join(' ');
}

/** "8.2" for a scored home; null for rankings saved before scores existed. */
export function formatScore(r: RankedHome): string | null {
  return typeof r.score === 'number' && Number.isFinite(r.score) ? r.score.toFixed(1) : null;
}

/**
 * NORA's ranking reordered by the buyer's saved order. Homes the buyer hasn't
 * placed (for example, recorded later) keep NORA's relative order at the end.
 * Ranks are renumbered by position; scores and labels stay NORA's.
 */
export function applyOverride(ranking: RankedHome[], order: string[] | null): RankedHome[] {
  if (!order?.length) return ranking;
  const byId = new Map(ranking.map((r) => [r.property_id, r]));
  const placed = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const placedIds = new Set(placed.map((r) => r.property_id));
  const rest = ranking.filter((r) => !placedIds.has(r.property_id));
  return [...placed, ...rest].map((r, i) => ({ ...r, rank: i + 1 }));
}

/** True when an order differs from NORA's (so there's something to revert). */
export function differsFrom(ranking: RankedHome[], order: string[] | null): boolean {
  if (!order?.length) return false;
  return applyOverride(ranking, order).some((r, i) => r.property_id !== ranking[i]?.property_id);
}

