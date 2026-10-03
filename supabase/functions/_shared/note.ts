// Pure note helpers: the model's output schema, faithfulness checks, and how a
// regenerated note merges with the buyer's edits. No runtime imports.

import { plainText } from './text.ts';

export const PROMPT_VERSION = '2026-10-03';

export type ItemKind = 'liked' | 'concern' | 'question';

export interface NoteItem {
  kind: ItemKind;
  text: string;
  quote: string;
}

export interface ModelNote {
  overall: string;
  items: NoteItem[];
}

/** JSON schema passed to the API as a structured-output format. */
export const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overall', 'items'],
  properties: {
    overall: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text', 'quote'],
        properties: {
          kind: { type: 'string', enum: ['liked', 'concern', 'question'] },
          text: { type: 'string' },
          quote: { type: 'string' },
        },
      },
    },
  },
} as const;

const KINDS: readonly ItemKind[] = ['liked', 'concern', 'question'];

/** Lowercase words without punctuation. Chinese has no spaces, so each Han character counts as a word. */
export function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\p{Script=Han}/gu, ' $& ')
    .replace(/[^\p{Script=Han}a-z0-9\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Share of the quote's words that appear, in order, as a run inside the transcript.
 * Uses the longest common run of words, so a paraphrase scores low and a faithful
 * excerpt with a punctuation or filler-word difference still scores high.
 */
export function quoteSupport(quote: string, transcript: string): number {
  const q = normalizeWords(quote);
  const t = normalizeWords(transcript);
  if (q.length === 0 || t.length === 0) return 0;
  // Longest common substring over words (dynamic programming, O(q * t) — clips are short).
  let best = 0;
  let prev = new Array<number>(t.length + 1).fill(0);
  for (let i = 1; i <= q.length; i++) {
    const cur = new Array<number>(t.length + 1).fill(0);
    for (let j = 1; j <= t.length; j++) {
      if (q[i - 1] === t[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best / q.length;
}

const MIN_SUPPORT = 0.6;

/**
 * Keeps only well-formed items whose quote can be found in the transcript.
 * Items without support are dropped: they may be invented.
 */
export function checkItems(items: NoteItem[], transcript: string): { kept: NoteItem[]; dropped: NoteItem[] } {
  const kept: NoteItem[] = [];
  const dropped: NoteItem[] = [];
  for (const item of items) {
    const text = plainText(item.text ?? '').trim();
    const quote = plainText(item.quote ?? '').trim();
    if (!KINDS.includes(item.kind) || !text || !quote || quoteSupport(quote, transcript) < MIN_SUPPORT) {
      dropped.push(item);
      continue;
    }
    kept.push({ kind: item.kind, text, quote });
  }
  return { kept, dropped };
}

export interface ExistingItem {
  id: string;
  origin: 'ai' | 'buyer';
  edited: boolean;
  deleted: boolean;
  quote: string | null;
}

/**
 * Plan for regenerating a note without undoing the buyer's work:
 * - untouched AI items are replaced,
 * - buyer-added, edited, and deleted (tombstoned) items are kept,
 * - a new AI item is skipped if its quote overlaps a kept or deleted item's quote.
 */
export function planRegeneration(existing: ExistingItem[], fresh: NoteItem[]) {
  const keep = existing.filter((e) => e.origin === 'buyer' || e.edited || e.deleted);
  const removeIds = existing.filter((e) => !keep.includes(e)).map((e) => e.id);
  const taken = keep.map((e) => normalizeWords(e.quote ?? '').join(' ')).filter(Boolean);
  const insert = fresh.filter((f) => {
    const q = normalizeWords(f.quote).join(' ');
    return !taken.some((t) => t === q || t.includes(q) || q.includes(t));
  });
  return { removeIds, insert };
}
