// Pure helpers for the ranking feature. No runtime imports, so they can be unit-tested.
//
// Two kinds of model turns:
// - rank: a full ranking with concise labels and pro/con tags, plus the learned priorities.
// - chat: a conversational reply in the Discuss screen that refines the priorities
//   (no re-ranking until the buyer asks for it).

import { plainText } from './text.ts';

export type Fit = 'strong' | 'good' | 'weak';
export type Importance = 'must' | 'high' | 'medium' | 'low';

export interface RankedHome {
  property_id: string;
  rank: number;
  /** 0–10, one decimal. Rough, for relative comparison: close scores = close call. */
  score: number;
  /** Derived from the score (kept for older app builds). */
  fit: Fit;
  /** 2–4 words, e.g. "Best overall fit". */
  label: string;
  /** Short tags, 1–3 words each, at most 3. */
  pros: string[];
  cons: string[];
}

export interface Priority {
  label: string;
  importance: Importance;
  evidence: string;
}

export interface RankOutput {
  headline: string;
  ranking: RankedHome[];
  priorities: Priority[];
}

export interface ChatOutput {
  reply: string;
  priorities: Priority[];
  question: string;
  suggestions: string[];
}

const PRIORITIES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'importance', 'evidence'],
    properties: {
      label: { type: 'string' },
      importance: { type: 'string', enum: ['must', 'high', 'medium', 'low'] },
      evidence: { type: 'string' },
    },
  },
} as const;

/** Structured output for a ranking turn. */
export const RANK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'ranking', 'priorities'],
  properties: {
    headline: { type: 'string' },
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['property_id', 'rank', 'score', 'label', 'pros', 'cons'],
        properties: {
          property_id: { type: 'string' },
          rank: { type: 'integer' },
          score: { type: 'number' },
          label: { type: 'string' },
          pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    priorities: PRIORITIES_SCHEMA,
  },
} as const;

/** Structured output for a Discuss turn. */
export const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'priorities', 'question', 'suggestions'],
  properties: {
    reply: { type: 'string' },
    priorities: PRIORITIES_SCHEMA,
    question: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface DossierVisit {
  recorded_at: string;
  overall: string | null;
  items: { kind: 'liked' | 'concern' | 'question'; text: string }[];
  personal_note: string | null;
}

export interface DossierHome {
  id: string;
  label: string; // address shown to the buyer
  city: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  price_kind: 'list' | 'last_sale' | null;
  price_date: string | null;
  listing_status: string | null;
  visits: DossierVisit[];
}

function money(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}K`;
}

function priceText(h: DossierHome): string | null {
  if (h.price == null) return null;
  const year = h.price_date?.slice(0, 4);
  if (h.price_kind === 'last_sale') return `last sold ${money(h.price)}${year ? ` in ${year}` : ''}`;
  if (h.listing_status && h.listing_status.toLowerCase() !== 'active') {
    return `last listed at ${money(h.price)}${year ? ` in ${year}` : ''} (listing not active)`;
  }
  return `listed at ${money(h.price)}`;
}

/** Everything the model knows about the buyer's homes, as compact text. */
export function buildDossier(homes: DossierHome[]): string {
  return homes
    .map((h) => {
      const facts = [
        h.beds != null ? `${Number(h.beds)} bd` : null,
        h.baths != null ? `${Number(h.baths)} ba` : null,
        h.sqft != null ? `${Number(h.sqft).toLocaleString('en-US')} sq ft` : null,
        priceText(h),
      ].filter(Boolean);
      const lines = [`<home id="${h.id}">`, `Address: ${h.label}${h.city ? `, ${h.city}` : ''}`];
      lines.push(`Facts (public records/listing): ${facts.length ? facts.join(', ') : 'not available'}`);
      h.visits.forEach((v, i) => {
        lines.push(`Visit ${i + 1} (${v.recorded_at.slice(0, 10)}):`);
        if (v.overall) lines.push(`  Overall: ${v.overall}`);
        for (const kind of ['liked', 'concern', 'question'] as const) {
          const points = v.items.filter((p) => p.kind === kind).map((p) => p.text);
          if (points.length) lines.push(`  ${kind === 'liked' ? 'Liked' : kind === 'concern' ? 'Concerns' : 'Questions'}: ${points.join('; ')}`);
        }
        if (v.personal_note?.trim()) lines.push(`  Buyer's own note: ${v.personal_note.trim()}`);
      });
      lines.push('</home>');
      return lines.join('\n');
    })
    .join('\n\n');
}

const IMPORTANCE: readonly Importance[] = ['must', 'high', 'medium', 'low'];

function shortText(s: unknown, maxChars: number): string {
  if (typeof s !== 'string') return '';
  const t = plainText(s).trim().replace(/\s+/g, ' ').replace(/[.。]+$/, '');
  return t.length > maxChars ? `${t.slice(0, maxChars - 1).trimEnd()}…` : t;
}

function tags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = shortText(r, 24);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === 3) break;
  }
  return out;
}

export function fitFromScore(score: number): Fit {
  return score >= 7.5 ? 'strong' : score >= 5 ? 'good' : 'weak';
}

function cleanScore(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

/**
 * Makes the model's ranking safe to show: drops unknown or repeated homes, keeps
 * labels and tags short, clamps scores to 0–10 and keeps them in rank order (a
 * lower-ranked home never scores higher), appends any home it left out at the end,
 * and renumbers 1..n.
 */
export function normalizeRanking(raw: (Partial<RankedHome> & { property_id: string; rank: number })[], homeIds: string[]): RankedHome[] {
  const known = new Set(homeIds);
  const seen = new Set<string>();
  const kept: (Omit<RankedHome, 'score' | 'fit'> & { score: number | null })[] = [];
  for (const r of [...raw].sort((a, b) => a.rank - b.rank)) {
    if (!known.has(r.property_id) || seen.has(r.property_id)) continue;
    seen.add(r.property_id);
    kept.push({
      property_id: r.property_id,
      rank: 0,
      score: cleanScore(r.score),
      label: shortText(r.label, 32),
      pros: tags(r.pros),
      cons: tags(r.cons),
    });
  }
  for (const id of homeIds) {
    if (!seen.has(id)) kept.push({ property_id: id, rank: 0, score: null, label: '', pros: [], cons: [] });
  }
  let ceiling = 10;
  return kept.map((r, i) => {
    // Missing scores sit just under the home above; scores never rise down the list.
    const score = Math.min(r.score ?? Math.max(0, ceiling - 0.5), ceiling);
    ceiling = score;
    return { ...r, rank: i + 1, score, fit: fitFromScore(score) };
  });
}

/** Cleans the learned priorities: valid importance, no blanks or duplicates, at most 12. */
export function normalizePriorities(raw: Priority[]): Priority[] {
  const seen = new Set<string>();
  const out: Priority[] = [];
  for (const p of raw ?? []) {
    const label = plainText(p.label ?? '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      importance: IMPORTANCE.includes(p.importance) ? p.importance : 'medium',
      evidence: plainText(p.evidence ?? '').trim(),
    });
  }
  const order: Record<Importance, number> = { must: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => order[a.importance] - order[b.importance]).slice(0, 12);
}

/** Tappable quick replies: trimmed, non-empty, distinct, short, at most 3. */
export function normalizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const text = plainText(r).trim().replace(/\s+/g, ' ');
    const key = text.toLowerCase();
    if (!text || text.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === 3) break;
  }
  return out;
}

/** A stored ranking item; rows saved before labels existed carry `reason` instead. */
export type StoredRankedHome = Partial<RankedHome> & { property_id: string; rank: number; reason?: string };

/**
 * How a past assistant turn is replayed to the model. Ranking turns list the
 * ranking by address with labels; chat turns give the reply and question.
 */
export function replayAssistantTurn(
  content: string,
  ranking: StoredRankedHome[] | null,
  question: string | null,
  labels: Map<string, string>,
): string {
  if (ranking?.length) {
    const list = ranking
      .map((r) => {
        const detail = [r.score != null ? `${r.score}/10` : r.fit, r.label].filter(Boolean).join(', ');
        return `#${r.rank} ${labels.get(r.property_id) ?? 'removed home'}${detail ? ` (${detail})` : ''}`;
      })
      .join(', ');
    return `${content.trim() ? `${content.trim()}\n` : ''}Ranking given: ${list}`;
  }
  const parts = [content.trim()];
  if (question?.trim()) parts.push(`Question asked: ${question.trim()}`);
  return parts.join('\n');
}
