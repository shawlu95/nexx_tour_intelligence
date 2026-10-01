// Pure ranking types and helpers (no imports), so they can be unit-tested.

export type Fit = 'strong' | 'good' | 'weak';
export type Importance = 'must' | 'high' | 'medium' | 'low';

export interface RankedHome {
  property_id: string;
  rank: number;
  fit: Fit;
  reason: string;
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
