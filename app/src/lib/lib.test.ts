import { describe, expect, it } from 'vitest';
import { displayAddress, distanceMeters, draftFromGeocode, formatDistance, normalizedKey } from './address';
import { retryDelayMs } from './backoff';
import { cueIndex, formatClock, formatWhen } from './format';

describe('normalizedKey', () => {
  it('treats spelling variants of the same address as equal', () => {
    const a = normalizedKey({ addressLine: '812 Pastoria Avenue', unit: '', city: 'Sunnyvale' });
    const b = normalizedKey({ addressLine: '812  pastoria ave.', unit: '', city: 'SUNNYVALE' });
    expect(a).toBe(b);
  });

  it('folds street directions and unit prefixes', () => {
    const a = normalizedKey({ addressLine: '445 South Murphy Street', unit: 'Unit 4B', city: 'Sunnyvale' });
    const b = normalizedKey({ addressLine: '445 S Murphy St', unit: '#4b', city: 'Sunnyvale' });
    expect(a).toBe(b);
  });

  it('keeps different units apart', () => {
    const a = normalizedKey({ addressLine: '10 Main St', unit: '1', city: 'X' });
    const b = normalizedKey({ addressLine: '10 Main St', unit: '2', city: 'X' });
    expect(a).not.toBe(b);
  });
});

describe('distances', () => {
  it('measures short distances accurately', () => {
    // Roughly 111 m per 0.001° of latitude.
    const d = distanceMeters({ latitude: 37.37, longitude: -122.03 }, { latitude: 37.371, longitude: -122.03 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it('formats feet and miles', () => {
    expect(formatDistance(50)).toBe('164 ft');
    expect(formatDistance(1609.344 * 0.6)).toBe('0.6 mi');
  });
});

describe('display helpers', () => {
  it('shows a unit when present', () => {
    expect(displayAddress({ address_line: '10 Main St', unit: '4B' })).toBe('10 Main St, Unit 4B');
    expect(displayAddress({ address_line: '10 Main St', unit: null })).toBe('10 Main St');
  });

  it('builds a draft from a reverse-geocoded address', () => {
    const draft = draftFromGeocode(
      { streetNumber: '812', street: 'Pastoria Avenue', city: 'Sunnyvale', region: 'CA', postalCode: '94086' },
      { latitude: 1, longitude: 2 },
    );
    expect(draft).toMatchObject({ addressLine: '812 Pastoria Avenue', city: 'Sunnyvale', region: 'CA', latitude: 1 });
  });

  it('falls back to the place name when there is no street number', () => {
    expect(draftFromGeocode({ name: 'Pastoria Ave', subregion: 'Santa Clara' }, { latitude: 0, longitude: 0 })).toMatchObject({
      addressLine: 'Pastoria Ave',
      city: 'Santa Clara',
    });
  });

  it('formats clocks and dates', () => {
    expect(formatClock(65)).toBe('1:05');
    const now = new Date(2026, 9, 1, 15, 0);
    expect(formatWhen(new Date(2026, 9, 1, 14, 24).toISOString(), now)).toBe('Today, 2:24 PM');
    expect(formatWhen(new Date(2026, 8, 30, 11, 2).toISOString(), now)).toBe('Yesterday, 11:02 AM');
    expect(formatWhen(new Date(2026, 8, 21, 10, 26).toISOString(), now)).toBe('Sep 21, 10:26 AM');
  });

  it('rotates recording cues and stops at the last one', () => {
    expect(cueIndex(0)).toBe(0);
    expect(cueIndex(14)).toBe(1);
    expect(cueIndex(500)).toBe(3);
  });
});

describe('retryDelayMs', () => {
  it('grows and caps', () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(15_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });
});
