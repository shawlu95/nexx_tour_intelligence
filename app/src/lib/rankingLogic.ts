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
