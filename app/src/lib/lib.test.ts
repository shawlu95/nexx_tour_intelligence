import { describe, expect, it } from 'vitest';
import {
  aboutDistance,
  cityState,
  displayAddress,
  distanceMeters,
  draftFromGeocode,
  EMPTY_DRAFT,
  formatDistance,
  geocodeQuery,
  normalizedKey,
  offsetPoint,
  samplePoints,
  uniqueStreetAddresses,
} from './address';
import { retryDelayMs } from './backoff';
import {
  applyOverride,
  differsFrom,
  discussedSinceRanking,
  formatScore,
  latestRanking,
  newHomesSince,
  shortLabel,
  type RankingMessage,
} from './rankingLogic';
import { detailRows, formatClock, formatWhen, fullMoney, homeType, listingPrice, startOfWeek } from './format';

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

});

describe('retryDelayMs', () => {
  it('grows and caps', () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(15_000);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });
});

describe('ranking helpers', () => {
  const msg = (over: Partial<RankingMessage>): RankingMessage => ({
    id: 'm',
    role: 'assistant',
    content: '',
    ranking: null,
    question: null,
    based_on: null,
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  });

  it('finds the most recent ranking', () => {
    const first = msg({ id: '1', ranking: [{ property_id: 'a', rank: 1, fit: 'good', reason: '' }] });
    const second = msg({ id: '2', ranking: [{ property_id: 'b', rank: 1, fit: 'good', reason: '' }] });
    expect(latestRanking([first, msg({ id: 'u', role: 'user' }), second, msg({ id: 'x' })])?.id).toBe('2');
    expect(latestRanking([msg({ role: 'user' })])).toBeNull();
  });

  it('knows when the buyer discussed after the latest ranking', () => {
    const rank = msg({ id: 'r', ranking: [{ property_id: 'a', rank: 1, fit: 'good' }] });
    expect(discussedSinceRanking([rank])).toBe(false);
    expect(discussedSinceRanking([rank, msg({ id: 'u', role: 'user' }), msg({ id: 'c' })])).toBe(true);
    expect(discussedSinceRanking([msg({ id: 'u', role: 'user' }), rank])).toBe(false);
  });

  it('uses the label, or shortens an older reason', () => {
    expect(shortLabel({ property_id: 'a', rank: 1, fit: 'good', label: ' Best overall fit ' })).toBe('Best overall fit');
    expect(shortLabel({ property_id: 'a', rank: 1, fit: 'good', reason: 'Great light and a big yard you loved' })).toBe('Great light and a…');
    expect(shortLabel({ property_id: 'a', rank: 1, fit: 'good' })).toBe('');
  });

  it('formats scores with one decimal, null when missing', () => {
    expect(formatScore({ property_id: 'a', rank: 1, fit: 'good', score: 8 })).toBe('8.0');
    expect(formatScore({ property_id: 'a', rank: 1, fit: 'good', score: 9.14 })).toBe('9.1');
    expect(formatScore({ property_id: 'a', rank: 1, fit: 'good' })).toBeNull();
  });

  it('lists homes recorded since the latest ranking', () => {
    const latest = msg({ based_on: ['a', 'b'], ranking: [{ property_id: 'a', rank: 1, fit: 'good', reason: '' }] });
    expect(newHomesSince(latest, ['a', 'b', 'c'])).toEqual(['c']);
    expect(newHomesSince(null, ['a'])).toEqual([]);
  });
});

describe('address lookup helpers', () => {
  it('builds a geocoding query from the parts that are known', () => {
    expect(geocodeQuery({ addressLine: '812 Pastoria Avenue', city: 'Sunnyvale', region: 'CA', postalCode: '94086' })).toBe(
      '812 Pastoria Avenue, Sunnyvale, CA 94086',
    );
    expect(geocodeQuery({ addressLine: '812 Pastoria Avenue', city: 'Sunnyvale', region: '', postalCode: '' })).toBe(
      '812 Pastoria Avenue, Sunnyvale',
    );
  });

  it('offsets points by meters', () => {
    const start = { latitude: 37.37, longitude: -122.03 };
    expect(distanceMeters(start, offsetPoint(start, 35, 0))).toBeCloseTo(35, 0);
    expect(distanceMeters(start, offsetPoint(start, 0, -35))).toBeCloseTo(35, 0);
    expect(samplePoints(start)).toHaveLength(7);
  });

  it('keeps distinct street addresses only', () => {
    const d = (addressLine: string) => ({ ...EMPTY_DRAFT, addressLine, city: 'Sunnyvale' });
    expect(
      uniqueStreetAddresses([d('812 Pastoria Avenue'), d('812 Pastoria Ave'), d('Pastoria Avenue'), d('790 Pastoria Ave')]).map(
        (x) => x.addressLine,
      ),
    ).toEqual(['812 Pastoria Avenue', '790 Pastoria Ave']);
  });
});

describe('manual ranking order', () => {
  const nora = ['a', 'b', 'c', 'd'].map((id, i) => ({ property_id: id, rank: i + 1, fit: 'good' as const, score: 9 - i }));

  it('applies the buyer order, keeps NORA scores, appends unplaced homes, renumbers', () => {
    const out = applyOverride(nora, ['c', 'a', 'zzz']);
    expect(out.map((r) => [r.property_id, r.rank, r.score])).toEqual([
      ['c', 1, 7],
      ['a', 2, 9],
      ['b', 3, 8],
      ['d', 4, 6],
    ]);
  });

  it('leaves NORA’s ranking alone without an override', () => {
    expect(applyOverride(nora, null)).toBe(nora);
    expect(applyOverride(nora, [])).toBe(nora);
  });

  it('knows when the buyer order differs from NORA’s', () => {
    expect(differsFrom(nora, ['a', 'b', 'c', 'd'])).toBe(false);
    expect(differsFrom(nora, ['b', 'a'])).toBe(true);
    expect(differsFrom(nora, null)).toBe(false);
  });

});

describe('startOfWeek', () => {
  it('returns local midnight on Monday', () => {
    expect(startOfWeek(new Date(2026, 9, 1, 15, 30))).toEqual(new Date(2026, 8, 28)); // Thu Oct 1 -> Mon Sep 28
    expect(startOfWeek(new Date(2026, 8, 28, 9))).toEqual(new Date(2026, 8, 28)); // Monday itself
    expect(startOfWeek(new Date(2026, 9, 4, 23))).toEqual(new Date(2026, 8, 28)); // Sunday belongs to the same week
  });
});

describe('confirm screen wording', () => {
  it('describes distance like the mockup', () => {
    expect(aboutDistance(24.4)).toBe('About 80 feet away');
    expect(aboutDistance(1)).toBe('About 10 feet away');
    expect(aboutDistance(500)).toBe('About 0.3 miles away');
    expect(aboutDistance(1609.344)).toBe('About 1.0 mile away');
  });

  it('spells out US states', () => {
    expect(cityState('Sunnyvale', 'CA')).toBe('Sunnyvale, California');
    expect(cityState('Castro Valley', 'California')).toBe('Castro Valley, California');
    expect(cityState('Sunnyvale', '')).toBe('Sunnyvale');
    expect(cityState(null, 'ca')).toBe('California');
  });
});

describe('confirm card and home page facts', () => {
  it('writes the price in full, or says it is unavailable', () => {
    expect(fullMoney(1849000)).toBe('$1,849,000');
    expect(listingPrice({ price: 1849000, price_kind: 'list', listing_status: 'Active' })).toBe('$1,849,000');
    expect(listingPrice({ price: 1200000, price_kind: 'last_sale', price_date: '2019-05-02' })).toBe('Sold $1,200,000 (2019)');
    expect(listingPrice({ price: null })).toBe('Price unavailable');
  });

  it('names the home type the way the mockup does', () => {
    expect(homeType({ property_type: 'Single Family' })).toBe('Single-family home');
    expect(homeType({ property_type: 'Co-op' })).toBe('Co-op');
    expect(homeType({})).toBe('Type unavailable');
  });

  it('lists the details with dashes for unknowns', () => {
    expect(detailRows({ year_built: 1968, lot_sqft: 6000, parking: '2-car garage', hoa_fee: null })).toEqual([
      { label: 'Year built', value: '1968' },
      { label: 'Lot size', value: '6,000 sq ft' },
      { label: 'Parking', value: '2-car garage' },
      { label: 'HOA', value: '—' },
    ]);
  });
});
