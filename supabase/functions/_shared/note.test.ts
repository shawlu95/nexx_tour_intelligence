import { describe, expect, it } from 'vitest';
import { checkItems, normalizeClarify, planRegeneration, quoteSupport, type ExistingItem, type NoteItem } from './note.ts';

const TRANSCRIPT =
  "Okay, 812 Pastoria. Really bright when you walk in, high ceilings. I love that the living room opens right onto the kitchen, and the island is huge. Cabinets are dated though, we'd probably redo those. The backyard is tiny, and there are power lines right along the back fence. Need to ask if those affect the price.";

describe('quoteSupport', () => {
  it('scores an exact excerpt as fully supported', () => {
    expect(quoteSupport('the island is huge', TRANSCRIPT)).toBe(1);
  });

  it('ignores case and punctuation differences', () => {
    expect(quoteSupport('Cabinets are dated, though. We’d probably redo those', TRANSCRIPT)).toBe(1);
  });

  it('scores a paraphrase low', () => {
    expect(quoteSupport('the kitchen has a very large island', TRANSCRIPT)).toBeLessThan(0.6);
  });

  it('requires words to appear as a run, not scattered', () => {
    expect(quoteSupport('backyard huge power price', TRANSCRIPT)).toBeLessThan(0.6);
  });

  it('handles empty input', () => {
    expect(quoteSupport('', TRANSCRIPT)).toBe(0);
    expect(quoteSupport('anything', '')).toBe(0);
  });
});

describe('quoteSupport in Chinese and mixed speech', () => {
  const CHINESE = '这个房子采光很好，厨房很大。但是后院太小了，而且后面有高压线，要问一下中介会不会影响价格。';
  const MIXED = '这个 house 的 kitchen island 很大，我很喜欢。But the backyard is tiny，后面还有 power lines。';

  it('matches a Chinese excerpt character by character, ignoring punctuation', () => {
    expect(quoteSupport('后院太小了，而且后面有高压线', CHINESE)).toBe(1);
  });

  it('scores a Chinese paraphrase low', () => {
    expect(quoteSupport('院子非常小并且附近有电线', CHINESE)).toBeLessThan(0.6);
  });

  it('matches excerpts that switch between Chinese and English', () => {
    expect(quoteSupport('kitchen island 很大，我很喜欢', MIXED)).toBe(1);
    expect(quoteSupport('the backyard is tiny, 后面还有 power lines', MIXED)).toBe(1);
  });
});

describe('checkItems', () => {
  const item = (kind: NoteItem['kind'], text: string, quote: string): NoteItem => ({ kind, text, quote });

  it('keeps items whose quote is in the transcript and drops invented ones', () => {
    const { kept, dropped } = checkItems(
      [
        item('liked', 'Large kitchen island', 'the island is huge'),
        item('concern', 'Power lines along the back fence', 'power lines right along the back fence'),
        item('liked', 'Great school district', 'the schools here are excellent'),
      ],
      TRANSCRIPT,
    );
    expect(kept.map((k) => k.text)).toEqual(['Large kitchen island', 'Power lines along the back fence']);
    expect(dropped.map((d) => d.text)).toEqual(['Great school district']);
  });

  it('drops malformed items', () => {
    const { kept, dropped } = checkItems(
      [
        item('liked', '  ', 'the island is huge'),
        item('liked', 'Island', ''),
        { kind: 'other' as NoteItem['kind'], text: 'Island', quote: 'the island is huge' },
      ],
      TRANSCRIPT,
    );
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(3);
  });

  it('trims kept text and quotes', () => {
    const { kept } = checkItems([item('question', '  Do power lines affect price?  ', ' affect the price ')], TRANSCRIPT);
    expect(kept[0]).toEqual({ kind: 'question', text: 'Do power lines affect price?', quote: 'affect the price' });
  });
});

describe('planRegeneration', () => {
  const existing = (over: Partial<ExistingItem> & { id: string }): ExistingItem => ({
    origin: 'ai',
    edited: false,
    deleted: false,
    quote: null,
    ...over,
  });

  it('replaces untouched AI items and keeps the buyer’s work', () => {
    const plan = planRegeneration(
      [
        existing({ id: 'ai-untouched', quote: 'the island is huge' }),
        existing({ id: 'ai-edited', edited: true, quote: 'high ceilings' }),
        existing({ id: 'ai-deleted', deleted: true, quote: 'cabinets are dated' }),
        existing({ id: 'buyer', origin: 'buyer' }),
      ],
      [],
    );
    expect(plan.removeIds).toEqual(['ai-untouched']);
  });

  it('does not re-add points the buyer edited or deleted', () => {
    const plan = planRegeneration(
      [
        existing({ id: 'a', edited: true, quote: 'Really bright when you walk in, high ceilings' }),
        existing({ id: 'b', deleted: true, quote: 'Cabinets are dated though' }),
      ],
      [
        { kind: 'liked', text: 'High ceilings', quote: 'high ceilings' },
        { kind: 'concern', text: 'Dated cabinets', quote: 'Cabinets are dated though' },
        { kind: 'liked', text: 'Large island', quote: 'the island is huge' },
      ],
    );
    expect(plan.insert.map((i) => i.text)).toEqual(['Large island']);
  });
});

describe('normalizeClarify', () => {
  const options = [
    { label: 'Not much', detail: 'I would still consider the home.' },
    { label: 'Somewhat', detail: 'I want to understand the impact.' },
    { label: 'A lot', detail: 'This could keep me from offering.' },
  ];

  it('keeps a question with its answers, tidied', () => {
    expect(normalizeClarify({ question: '  How much do the power lines concern you? ', reason: 'You mentioned them.', options })).toEqual({
      question: 'How much do the power lines concern you?',
      reason: 'You mentioned them.',
      options,
    });
  });

  it('returns null when there is no question or too few answers', () => {
    expect(normalizeClarify({ question: '', reason: '', options })).toBeNull();
    expect(normalizeClarify({ question: 'How much?', reason: '', options: options.slice(0, 1) })).toBeNull();
    expect(normalizeClarify(undefined)).toBeNull();
  });

  it('drops duplicate or blank answers and keeps at most three', () => {
    const c = normalizeClarify({
      question: 'How much?',
      reason: '',
      options: [options[0], { label: 'not much', detail: '' }, { label: ' ', detail: '' }, options[1], options[2], { label: 'Extra', detail: '' }],
    });
    expect(c?.options.map((o) => o.label)).toEqual(['Not much', 'Somewhat', 'A lot']);
  });
});
