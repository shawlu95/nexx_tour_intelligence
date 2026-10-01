import { describe, expect, it } from 'vitest';
import {
  buildDossier,
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
  it('drops unknown and repeated homes, appends missing ones, renumbers', () => {
    const out = normalizeRanking(
      [
        { property_id: 'b', rank: 2, fit: 'good', reason: ' Big yard ' },
        { property_id: 'x', rank: 1, fit: 'strong', reason: 'Not a real home' },
        { property_id: 'a', rank: 3, fit: 'strong', reason: 'Great light' },
        { property_id: 'b', rank: 4, fit: 'weak', reason: 'Duplicate' },
      ],
      ['a', 'b', 'c'],
    );
    expect(out).toEqual([
      { property_id: 'b', rank: 1, fit: 'good', reason: 'Big yard' },
      { property_id: 'a', rank: 2, fit: 'strong', reason: 'Great light' },
      { property_id: 'c', rank: 3, fit: 'weak', reason: '' },
    ]);
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
  it('replays the reply, ranking by address, and question', () => {
    const text = replayAssistantTurn(
      'Here is my ranking.',
      [{ property_id: 'a', rank: 1, fit: 'strong', reason: '' }],
      'How long a commute is OK?',
      new Map([['a', '18631 Laredo Rd']]),
    );
    expect(text).toBe('Here is my ranking.\nRanking given: #1 18631 Laredo Rd (strong)\nQuestion asked: How long a commute is OK?');
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
