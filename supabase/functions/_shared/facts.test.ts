import { describe, expect, it } from 'vitest';
import {
  asArray,
  buildAddressQuery,
  factsFromListing,
  factsFromRecord,
  hasFacts,
  isAreaQuery,
  mergeFacts,
  parkingText,
  pickMatch,
  type PropertyRow,
} from './facts.ts';

const base: PropertyRow = {
  address_line: '812 Pastoria Avenue',
  unit: null,
  city: 'Sunnyvale',
  region: 'CA',
  postal_code: '94086',
  latitude: 37.37,
  longitude: -122.03,
};

describe('buildAddressQuery', () => {
  it('uses the full address when city, state and ZIP are known', () => {
    expect(buildAddressQuery(base)).toEqual({ address: '812 Pastoria Avenue, Sunnyvale, CA 94086' });
  });

  it('includes the unit', () => {
    expect(buildAddressQuery({ ...base, unit: '4B' })).toEqual({ address: '812 Pastoria Avenue Unit 4B, Sunnyvale, CA 94086' });
  });

  it('falls back to a small area search when state or ZIP is missing', () => {
    const q = buildAddressQuery({ ...base, region: null, postal_code: '' });
    expect(q).toEqual({ latitude: '37.37', longitude: '-122.03', radius: '0.05' });
    expect(isAreaQuery(q!)).toBe(true);
  });

  it('gives up without an address or coordinates', () => {
    expect(buildAddressQuery({ ...base, region: null, latitude: null, longitude: null })).toBeNull();
    expect(buildAddressQuery({ ...base, address_line: '  ' })).toBeNull();
  });
});

describe('pickMatch', () => {
  const results = [
    { formattedAddress: '790 Pastoria Ave, Sunnyvale, CA 94086', addressLine1: '790 Pastoria Ave' },
    { formattedAddress: '812 Pastoria Ave, Sunnyvale, CA 94086', addressLine1: '812 Pastoria Ave' },
  ];

  it('matches street number and name across spelling variants', () => {
    expect(pickMatch(results, '812 Pastoria Avenue')?.addressLine1).toBe('812 Pastoria Ave');
  });

  it('returns null when nothing matches', () => {
    expect(pickMatch(results, '900 Pastoria Avenue')).toBeNull();
    expect(pickMatch(results, '812 Murphy Avenue')).toBeNull();
    expect(pickMatch(results, 'Pastoria')).toBeNull();
  });
});

describe('parsing RentCast responses', () => {
  it('reads an active listing', () => {
    const f = factsFromListing({
      price: 1889000,
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1742,
      status: 'Active',
      listedDate: '2026-09-25T00:00:00.000Z',
    });
    expect(f).toEqual({
      beds: 3,
      baths: 2,
      sqft: 1742,
      price: 1889000,
      price_kind: 'list',
      price_date: '2026-09-25',
      listing_status: 'Active',
      property_type: null,
      year_built: null,
      lot_sqft: null,
      parking: null,
      hoa_fee: null,
    });
  });

  it('reads type, year built, lot, parking and HOA', () => {
    const f = factsFromRecord({
      propertyType: 'Single Family',
      yearBuilt: 1968,
      lotSize: 6000,
      hoa: { fee: 0 },
      features: { garage: true, garageSpaces: 2 },
    });
    expect(f).toMatchObject({ property_type: 'Single Family', year_built: 1968, lot_sqft: 6000, parking: '2-car garage', hoa_fee: null });
    expect(parkingText({ garage: true })).toBe('Garage');
    expect(parkingText(undefined)).toBeNull();
    expect(factsFromListing({ hoa: { fee: 350 } }).hoa_fee).toBe(350);
  });

  it('reads a public record with a last sale', () => {
    const f = factsFromRecord({ bedrooms: 3, bathrooms: 2.5, squareFootage: 1742.4, lastSalePrice: 1200000, lastSaleDate: '2019-05-02' });
    expect(f).toMatchObject({ beds: 3, baths: 2.5, sqft: 1742, price: 1200000, price_kind: 'last_sale', price_date: '2019-05-02' });
  });

  it('ignores missing and malformed values', () => {
    const f = factsFromRecord({ bedrooms: undefined, squareFootage: Number.NaN, lastSaleDate: 'soon' } as never);
    expect(f).toEqual({
      beds: null,
      baths: null,
      sqft: null,
      price: null,
      price_kind: null,
      price_date: null,
      listing_status: null,
      property_type: null,
      year_built: null,
      lot_sqft: null,
      parking: null,
      hoa_fee: null,
    });
    expect(hasFacts(f)).toBe(false);
  });

  it('accepts arrays, single objects, and junk', () => {
    expect(asArray([{ a: 1 }])).toHaveLength(1);
    expect(asArray({ a: 1 })).toHaveLength(1);
    expect(asArray(null)).toEqual([]);
    expect(asArray('nope')).toEqual([]);
  });
});

describe('mergeFacts', () => {
  const listing = factsFromListing({ price: 1889000, bedrooms: 3, bathrooms: 2, status: 'Active' });
  const record = factsFromRecord({ bedrooms: 3, bathrooms: 2, squareFootage: 1742, lastSalePrice: 1200000, lastSaleDate: '2019-05-02' });

  it('prefers the listing price and fills gaps from the record', () => {
    expect(mergeFacts(listing, record)).toMatchObject({ price: 1889000, price_kind: 'list', sqft: 1742, listing_status: 'Active' });
  });

  it('uses the record alone when there is no listing', () => {
    expect(mergeFacts(null, record)).toMatchObject({ price: 1200000, price_kind: 'last_sale' });
    expect(mergeFacts(null, null)).toBeNull();
  });
});
