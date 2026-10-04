import { describe, expect, it } from 'vitest';
import { addressFrom, suggestionsFrom } from './places.ts';

describe('suggestionsFrom', () => {
  it('reads main and secondary text, skipping incomplete predictions', () => {
    expect(
      suggestionsFrom({
        suggestions: [
          {
            placePrediction: {
              placeId: 'abc',
              text: { text: '812 Pastoria Avenue, Sunnyvale, CA, USA' },
              structuredFormat: { mainText: { text: '812 Pastoria Avenue' }, secondaryText: { text: 'Sunnyvale, CA, USA' } },
            },
          },
          { placePrediction: { text: { text: 'no id' } } },
          {},
        ],
      }),
    ).toEqual([{ placeId: 'abc', main: '812 Pastoria Avenue', secondary: 'Sunnyvale, CA, USA' }]);
    expect(suggestionsFrom(null)).toEqual([]);
  });
});

describe('addressFrom', () => {
  const components = [
    { longText: '812', shortText: '812', types: ['street_number'] },
    { longText: 'Pastoria Avenue', shortText: 'Pastoria Ave', types: ['route'] },
    { longText: '4B', shortText: '4B', types: ['subpremise'] },
    { longText: 'Sunnyvale', shortText: 'Sunnyvale', types: ['locality', 'political'] },
    { longText: 'California', shortText: 'CA', types: ['administrative_area_level_1', 'political'] },
    { longText: '94086', shortText: '94086', types: ['postal_code'] },
  ];

  it('builds the street line, unit, city, state and ZIP', () => {
    expect(addressFrom({ addressComponents: components, location: { latitude: 37.37, longitude: -122.03 } })).toEqual({
      addressLine: '812 Pastoria Avenue',
      unit: '4B',
      city: 'Sunnyvale',
      region: 'CA',
      postalCode: '94086',
      latitude: 37.37,
      longitude: -122.03,
    });
  });

  it('returns null without a street address', () => {
    expect(addressFrom({ addressComponents: [{ longText: 'Sunnyvale', types: ['locality'] }] })).toBeNull();
    expect(addressFrom(null)).toBeNull();
  });
});
