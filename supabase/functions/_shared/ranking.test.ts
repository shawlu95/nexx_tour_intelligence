import { describe, expect, it } from 'vitest';
import {
  buildDossier,
  clarificationText,
  normalizePriorities,
  normalizeRanking,
  normalizeSuggestions,
  replayAssistantTurn,
  type DossierHome,
} from './ranking.ts';

const home = (over: Partial<DossierHome> & { id: string }): DossierHome => ({
  label: '18631 Laredo Rd',
  city: 'Castro Valley',
  beds: 3,
  baths: 2,
  sqft: 1744,
  price: 1069000,
  price_kind: 'list',
  price_date: '2025-05-08',
  listing_status: 'Inactive',
  visits: [],
  ...over,
});

describe('buildDossier', () => {
  it('includes facts, an honest price, and each visit’s points', () => {
    const text = buildDossier([
      home({
        id: 'a',
        visits: [
          {
            recorded_at: '2026-10-01T21:00:00Z',
            overall: 'You liked the light.',
            items: [
              { kind: 'liked', text: 'Bright kitchen' },
              { kind: 'concern', text: 'Small yard' },
              { kind: 'question', text: 'HOA fees?' },
            ],
            personal_note: 'Close to work',
          },
        ],
      }),
    ]);
    expect(text).toContain('<home id="a">');
    expect(text).toContain('3 bd, 2 ba, 1,744 sq ft, last listed at $1.07M in 2025 (listing not active)');
    expect(text).toContain('Liked: Bright kitchen');
    expect(text).toContain('Concerns: Small yard');
    expect(text).toContain('Questions: HOA fees?');
    expect(text).toContain("Buyer's own note: Close to work");
  });

  it('says when facts are missing', () => {
    expect(buildDossier([home({ id: 'b', beds: null, baths: null, sqft: null, price: null })])).toContain('not available');
  });
});

describe('normalizeRanking', () => {
  const r = (property_id: string, rank: number, label: string, score?: number) => ({ property_id, rank, score, label, pros: [], cons: [] });

  it('drops unknown and repeated homes, appends missing ones, renumbers', () => {
    const out = normalizeRanking(
      [r('b', 2, ' Big yard. ', 8.1), r('x', 1, 'Not a real home', 9), r('a', 3, 'Great light', 6.4), r('b', 4, 'Duplicate', 1)],
      ['a', 'b', 'c'],
    );
    expect(out.map((h) => [h.property_id, h.rank, h.label, h.score])).toEqual([
      ['b', 1, 'Big yard', 8.1],
      ['a', 2, 'Great light', 6.4],
      ['c', 3, '', 5.9],
    ]);
  });

  it('clamps scores to 0–10, rounds to one decimal, and never lets them rise down the list', () => {
    const out = normalizeRanking([r('a', 1, '', 11.26), r('b', 2, '', 9.4), r('c', 3, '', -2), r('d', 4, '', 3)], ['a', 'b', 'c', 'd']);
    expect(out.map((h) => h.score)).toEqual([10, 9.4, 0, 0]);
  });

  it('derives fit from the score for older app builds', () => {
    const out = normalizeRanking([r('a', 1, '', 8.2), r('b', 2, '', 6), r('c', 3, '', 3.1)], ['a', 'b', 'c']);
    expect(out.map((h) => h.fit)).toEqual(['strong', 'good', 'weak']);
  });

  it('keeps labels and tags short and distinct', () => {
    const [h] = normalizeRanking(
      [
        {
          property_id: 'a',
          rank: 1,
          score: 9,
          label: 'The best overall fit for everything you said you wanted',
          pros: ['Big yard', 'big yard', '  Bright kitchen ', 'Quiet street', 'Fourth tag'],
          cons: ['Dated bathrooms and a roof that will need replacing soon'],
        },
      ],
      ['a'],
    );
    expect(h.label.length).toBeLessThanOrEqual(32);
    expect(h.label.endsWith('…')).toBe(true);
    expect(h.pros).toEqual(['Big yard', 'Bright kitchen', 'Quiet street']);
    expect(h.cons[0].length).toBeLessThanOrEqual(24);
  });
});

describe('normalizePriorities', () => {
  it('removes blanks and duplicates, fixes importance, sorts by importance', () => {
    const out = normalizePriorities([
      { label: 'Big yard', importance: 'medium', evidence: 'Said twice' },
      { label: '  ', importance: 'high', evidence: '' },
      { label: 'Short commute', importance: 'must', evidence: 'Works in SF' },
      { label: 'big yard', importance: 'low', evidence: 'dup' },
      { label: 'Quiet street', importance: 'urgent' as never, evidence: '' },
    ]);
    expect(out.map((p) => [p.label, p.importance])).toEqual([
      ['Short commute', 'must'],
      ['Big yard', 'medium'],
      ['Quiet street', 'medium'],
    ]);
  });
});

describe('replayAssistantTurn', () => {
  const labels = new Map([['a', '18631 Laredo Rd']]);

  it('replays a ranking turn by address and label', () => {
    expect(
      replayAssistantTurn(
        'Laredo is your best fit',
        [{ property_id: 'a', rank: 1, score: 9.1, fit: 'strong', label: 'Best overall fit', pros: [], cons: [] }],
        null,
        labels,
      ),
    ).toBe('Laredo is your best fit\nRanking given: #1 18631 Laredo Rd (9.1/10, Best overall fit)');
  });

  it('replays older ranking rows that have no label', () => {
    expect(replayAssistantTurn('', [{ property_id: 'a', rank: 1, fit: 'good', reason: 'old' }], null, labels)).toBe(
      'Ranking given: #1 18631 Laredo Rd (good)',
    );
  });

  it('replays a chat turn with its question', () => {
    expect(replayAssistantTurn('Got it.', null, 'How long a commute is OK?', labels)).toBe('Got it.\nQuestion asked: How long a commute is OK?');
  });
});

describe('normalizeSuggestions', () => {
  it('keeps up to three short, distinct, non-empty replies', () => {
    expect(
      normalizeSuggestions(['  Yes,  compare the yards ', 'yes, compare the yards', '', 7, 'Commute matters more', 'Both equally', 'A fourth one']),
    ).toEqual(['Yes, compare the yards', 'Commute matters more', 'Both equally']);
  });

  it('drops overly long replies and non-arrays', () => {
    expect(normalizeSuggestions(['x'.repeat(81)])).toEqual([]);
    expect(normalizeSuggestions(null)).toEqual([]);
  });
});

describe('clarificationText', () => {
  const clarify = {
    question: 'How much do the power lines concern you?',
    options: [
      { label: 'Not much', detail: 'I would still consider the home.' },
      { label: 'A lot', detail: 'This could keep me from offering.' },
    ],
  };

  it('pairs the question with the chosen answer and its detail', () => {
    expect(clarificationText(clarify, 'A lot')).toBe(
      'How much do the power lines concern you? → A lot (This could keep me from offering.)',
    );
  });

  it('is null when unanswered or skipped', () => {
    expect(clarificationText(clarify, null)).toBeNull();
    expect(clarificationText(clarify, 'skipped')).toBeNull();
    expect(clarificationText(null, 'A lot')).toBeNull();
  });
});
