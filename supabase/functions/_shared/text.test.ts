import { describe, expect, it } from 'vitest';
import { plainText } from './text.ts';

describe('plainText', () => {
  it('decodes leftover unicode escapes', () => {
    expect(plainText('Got it \\u2014 I\\u2019ll move it')).toBe('Got it — I’ll move it');
    expect(plainText('Nice \\ud83c\\udfe1')).toBe('Nice 🏡');
  });
  it('decodes newline and quote escapes', () => {
    expect(plainText('One\\nTwo \\"yes\\"')).toBe('One\nTwo "yes"');
  });
  it('leaves normal text alone', () => {
    expect(plainText('Price: $500K — fine')).toBe('Price: $500K — fine');
  });
});
