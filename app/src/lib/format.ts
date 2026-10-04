// Display formatting. Pure functions.

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Today, 2:24 PM", "Yesterday, 11:02 AM", or "Sep 21, 10:26 AM". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `${d.toLocaleDateString('en-US', opts)}, ${time}`;
}

export interface HomeFacts {
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  price?: number | null;
  price_kind?: 'list' | 'last_sale' | null;
  price_date?: string | null;
  listing_status?: string | null;
  property_type?: string | null;
  year_built?: number | null;
  lot_sqft?: number | null;
  parking?: string | null;
  hoa_fee?: number | null;
}

/** "$1,849,000". */
export function fullMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** The price as the confirm card and home page show it, or "Price unavailable". */
export function listingPrice(f: HomeFacts): string {
  if (f.price == null) return 'Price unavailable';
  const money = fullMoney(Number(f.price));
  const year = f.price_date?.slice(0, 4);
  if (f.price_kind === 'last_sale') return `Sold ${money}${year ? ` (${year})` : ''}`;
  if (f.listing_status && f.listing_status.toLowerCase() !== 'active') return `Last listed ${money}${year ? ` (${year})` : ''}`;
  return money;
}

const TYPE_LABELS: Record<string, string> = {
  'single family': 'Single-family home',
  'multi-family': 'Multi-family home',
  'multi family': 'Multi-family home',
  condo: 'Condo',
  townhouse: 'Townhouse',
  manufactured: 'Manufactured home',
  apartment: 'Apartment',
  land: 'Land',
};

/** RentCast's property type as the mockup words it ("Single-family home"), or "Type unavailable". */
export function homeType(f: HomeFacts): string {
  const t = f.property_type?.trim();
  if (!t) return 'Type unavailable';
  return TYPE_LABELS[t.toLowerCase()] ?? t;
}

/** Year built, lot size, parking and HOA, with "—" for anything unknown. */
export function detailRows(f: HomeFacts): FactTile[] {
  return [
    { label: 'Year built', value: f.year_built != null ? String(f.year_built) : '—' },
    { label: 'Lot size', value: f.lot_sqft != null ? `${Number(f.lot_sqft).toLocaleString('en-US')} sq ft` : '—' },
    { label: 'Parking', value: f.parking ?? '—' },
    { label: 'HOA', value: f.hoa_fee != null ? `${fullMoney(Number(f.hoa_fee))}/mo` : '—' },
  ];
}

export interface FactTile {
  label: string;
  value: string;
}

/** Local midnight on the Monday of `now`'s week ("this week" on the Tour page). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

