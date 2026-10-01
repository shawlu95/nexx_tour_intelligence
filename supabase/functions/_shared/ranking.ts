// Pure helpers for the ranking conversation. No runtime imports, so they can be unit-tested.

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

export interface RankingOutput {
  reply: string;
  ranking: RankedHome[];
  priorities: Priority[];
  question: string;
  suggestions: string[];
}

/** JSON schema passed to the API as a structured-output format. */
export const RANKING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'ranking', 'priorities', 'question', 'suggestions'],
  properties: {
    reply: { type: 'string' },
    ranking: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['property_id', 'rank', 'fit', 'reason'],
        properties: {
          property_id: { type: 'string' },
          rank: { type: 'integer' },
          fit: { type: 'string', enum: ['strong', 'good', 'weak'] },
          reason: { type: 'string' },
        },
      },
    },
    priorities: {
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
    },
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

const FITS: readonly Fit[] = ['strong', 'good', 'weak'];
const IMPORTANCE: readonly Importance[] = ['must', 'high', 'medium', 'low'];

/**
 * Makes the model's ranking safe to show: drops unknown or repeated homes, appends
 * any home it left out (as a weak fit at the end), and renumbers 1..n.
 */
export function normalizeRanking(raw: RankedHome[], homeIds: string[]): RankedHome[] {
  const known = new Set(homeIds);
  const seen = new Set<string>();
  const kept: RankedHome[] = [];
  for (const r of [...raw].sort((a, b) => a.rank - b.rank)) {
    if (!known.has(r.property_id) || seen.has(r.property_id)) continue;
    seen.add(r.property_id);
    kept.push({
      property_id: r.property_id,
      rank: 0,
      fit: FITS.includes(r.fit) ? r.fit : 'good',
      reason: (r.reason ?? '').trim(),
    });
  }
  for (const id of homeIds) {
    if (!seen.has(id)) kept.push({ property_id: id, rank: 0, fit: 'weak', reason: '' });
  }
  return kept.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Cleans the learned priorities: valid importance, no blanks or duplicates, at most 12. */
export function normalizePriorities(raw: Priority[]): Priority[] {
  const seen = new Set<string>();
  const out: Priority[] = [];
  for (const p of raw) {
    const label = (p.label ?? '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      importance: IMPORTANCE.includes(p.importance) ? p.importance : 'medium',
      evidence: (p.evidence ?? '').trim(),
    });
  }
  const order: Record<Importance, number> = { must: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => order[a.importance] - order[b.importance]).slice(0, 12);
}

/**
 * How a past assistant turn is replayed to the model: its reply, the ranking it
 * gave (by address, so the model can refer to it), and the question it asked.
 */
export function replayAssistantTurn(
  reply: string,
  ranking: RankedHome[] | null,
  question: string | null,
  labels: Map<string, string>,
): string {
  const parts = [reply.trim()];
  if (ranking?.length) {
    parts.push(
      'Ranking given: ' +
        ranking.map((r) => `#${r.rank} ${labels.get(r.property_id) ?? 'removed home'} (${r.fit})`).join(', '),
    );
  }
  if (question?.trim()) parts.push(`Question asked: ${question.trim()}`);
  return parts.join('\n');
}

/** Tappable quick replies: trimmed, non-empty, distinct, short, at most 3. */
export function normalizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const text = r.trim().replace(/\s+/g, ' ');
    const key = text.toLowerCase();
    if (!text || text.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === 3) break;
  }
  return out;
}
