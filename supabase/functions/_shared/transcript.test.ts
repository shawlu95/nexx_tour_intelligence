import { describe, expect, it } from 'vitest';
import { cleanUtterances, formatClock, fullText } from './transcript.ts';

describe('transcript helpers', () => {
  it('drops empty utterances and trims text', () => {
    const cleaned = cleanUtterances([
      { start: 0.123, end: 2.456, text: '  Bright entry. ' },
      { start: 2.5, end: 3, text: '   ' },
      { start: 3.1, end: 5.9, text: 'Huge island.' },
    ]);
    expect(cleaned).toEqual([
      { start: 0.12, end: 2.46, text: 'Bright entry.' },
      { start: 3.1, end: 5.9, text: 'Huge island.' },
    ]);
    expect(fullText(cleaned)).toBe('Bright entry. Huge island.');
  });

  it('formats clock times', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(55.9)).toBe('0:55');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
