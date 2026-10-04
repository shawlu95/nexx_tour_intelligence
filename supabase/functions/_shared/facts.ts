// Pure helpers for home facts from RentCast. No runtime imports, so they can be unit-tested.

export interface PropertyRow {
  address_line: string;
  unit: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Facts {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  price_kind: 'list' | 'last_sale' | null;
  price_date: string | null; // YYYY-MM-DD
  listing_status: string | null;
  /** "Single Family", "Condo", "Townhouse", … as RentCast names it. */
  property_type: string | null;
  year_built: number | null;
  lot_sqft: number | null;
  /** e.g. "2-car garage", from the public record's features. */
  parking: string | null;
  /** Monthly HOA fee in dollars, when RentCast has one. */
  hoa_fee: number | null;
}

/** Query parameters for a RentCast lookup, or null if the property can't be looked up. */
export function buildAddressQuery(p: PropertyRow): Record<string, string> | null {
  const street = p.address_line.trim();
  if (!street) return null;
  const line = p.unit ? `${street} Unit ${p.unit.trim()}` : street;
  if (p.city && p.region && p.postal_code) {
    return { address: `${line}, ${p.city.trim()}, ${p.region.trim()} ${p.postal_code.trim()}` };
  }
  if (p.latitude !== null && p.longitude !== null) {
    // About 80 m; results are then matched on street number and name.
    return { latitude: String(p.latitude), longitude: String(p.longitude), radius: '0.05' };
  }
  return null;
}

/** True when the query searches an area, so results must be matched to the street address. */
export function isAreaQuery(q: Record<string, string>): boolean {
  return !('address' in q);
}

const SUFFIXES: Record<string, string> = {
  avenue: 'ave', street: 'st', road: 'rd', drive: 'dr', court: 'ct', boulevard: 'blvd',
  lane: 'ln', place: 'pl', terrace: 'ter', circle: 'cir', parkway: 'pkwy', way: 'way',
  north: 'n', south: 's', east: 'e', west: 'w',
};

function streetTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? w);
}

interface Addressed {
  formattedAddress?: string;
  addressLine1?: string;
}

/** Picks the result whose street number and first street word match `addressLine`. */
export function pickMatch<T extends Addressed>(results: T[], addressLine: string): T | null {
  const want = streetTokens(addressLine);
  if (want.length < 2) return null;
  const [number, name] = want;
  return (
    results.find((r) => {
      const have = streetTokens(r.addressLine1 ?? r.formattedAddress ?? '');
      return have[0] === number && have.includes(name);
    }) ?? null
  );
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function day(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

interface RentcastDetails {
  propertyType?: string;
  yearBuilt?: number;
  lotSize?: number;
  hoa?: { fee?: number };
  features?: { garage?: boolean; garageSpaces?: number; garageType?: string };
}

/** A sale listing from GET /v1/listings/sale. */
export interface RentcastListing extends Addressed, RentcastDetails {
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  status?: string;
  listedDate?: string;
}

/** A public record from GET /v1/properties. */
export interface RentcastRecord extends Addressed, RentcastDetails {
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
}

/** RentCast list endpoints return an array; tolerate a single object or junk. */
export function asArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === 'object') return [json as T];
  return [];
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** "2-car garage", "Garage", or null. */
export function parkingText(features: RentcastDetails['features']): string | null {
  const spaces = int(features?.garageSpaces);
  if (spaces && spaces > 0) return `${spaces}-car garage`;
  return features?.garage ? 'Garage' : null;
}

function details(d: RentcastDetails) {
  const fee = num(d.hoa?.fee);
  return {
    property_type: text(d.propertyType),
    year_built: int(d.yearBuilt),
    lot_sqft: int(d.lotSize),
    parking: parkingText(d.features),
    hoa_fee: fee !== null && fee > 0 ? fee : null,
  };
}

export function factsFromListing(l: RentcastListing): Facts {
  return {
    beds: num(l.bedrooms),
    baths: num(l.bathrooms),
    sqft: int(l.squareFootage),
    price: int(l.price),
    price_kind: int(l.price) !== null ? 'list' : null,
    price_date: day(l.listedDate),
    listing_status: typeof l.status === 'string' ? l.status : null,
    ...details(l),
  };
}

export function factsFromRecord(r: RentcastRecord): Facts {
  return {
    beds: num(r.bedrooms),
    baths: num(r.bathrooms),
    sqft: int(r.squareFootage),
    price: int(r.lastSalePrice),
    price_kind: int(r.lastSalePrice) !== null ? 'last_sale' : null,
    price_date: day(r.lastSaleDate),
    listing_status: null,
    ...details(r),
  };
}

/** True when the facts have anything worth showing. */
export function hasFacts(f: Facts): boolean {
  return f.beds !== null || f.baths !== null || f.sqft !== null || f.price !== null;
}

/**
 * Combines a listing (preferred: current price and description) with a public
 * record (fills gaps such as square feet missing from the listing).
 */
export function mergeFacts(listing: Facts | null, record: Facts | null): Facts | null {
  if (!listing && !record) return null;
  if (!listing) return record;
  if (!record) return listing;
  return {
    beds: listing.beds ?? record.beds,
    baths: listing.baths ?? record.baths,
    sqft: listing.sqft ?? record.sqft,
    price: listing.price ?? record.price,
    price_kind: listing.price !== null ? listing.price_kind : record.price_kind,
    price_date: listing.price !== null ? listing.price_date : record.price_date,
    listing_status: listing.listing_status,
    property_type: listing.property_type ?? record.property_type,
    year_built: listing.year_built ?? record.year_built,
    lot_sqft: listing.lot_sqft ?? record.lot_sqft,
    parking: listing.parking ?? record.parking,
    hoa_fee: listing.hoa_fee ?? record.hoa_fee,
  };
}
