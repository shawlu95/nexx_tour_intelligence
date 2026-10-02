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

/** Cue shown during recording, rotating every `secondsPerCue`. */
export const CUES = [
  { title: 'What stood out?', hint: "The first thing you'd tell a friend about this home." },
  { title: 'Anything that worried you?', hint: 'Condition, noise, layout, the neighborhood.' },
  { title: 'A question for your agent?', hint: 'Price, HOA, disclosures, timing.' },
  { title: 'Would you come back?', hint: 'For a second look, or to make an offer.' },
] as const;

export function cueIndex(elapsedSeconds: number, secondsPerCue = 14): number {
  return Math.min(CUES.length - 1, Math.max(0, Math.floor(elapsedSeconds / secondsPerCue)));
}

export interface HomeFacts {
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  price?: number | null;
  price_kind?: 'list' | 'last_sale' | null;
  price_date?: string | null;
  listing_status?: string | null;
}

/** "3 bd · 2 ba · 1,742 sq ft", leaving out what's unknown. Empty string when nothing is known. */
export function formatFacts(f: HomeFacts): string {
  const parts: string[] = [];
  // Postgres numeric columns can arrive as strings, so coerce.
  if (f.beds != null) parts.push(`${trimNumber(Number(f.beds))} bd`);
  if (f.baths != null) parts.push(`${trimNumber(Number(f.baths))} ba`);
  if (f.sqft != null) parts.push(`${Number(f.sqft).toLocaleString('en-US')} sq ft`);
  return parts.join(' · ');
}

/** "$1.89M", "$899K", "$450". */
export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${trimNumber(Math.round(n / 10_000) / 100)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/**
 * "Listed $1.89M" for an active listing, "Last listed $1.07M (2025)" for an old
 * one, "Sold $1.2M (2019)" for a past sale. Empty string when there's no price.
 */
export function formatPrice(f: HomeFacts): string {
  if (f.price == null) return '';
  const money = formatMoney(Number(f.price));
  const year = f.price_date?.slice(0, 4);
  const suffix = year ? ` (${year})` : '';
  if (f.price_kind === 'last_sale') return `Sold ${money}${suffix}`;
  if (f.listing_status && f.listing_status.toLowerCase() !== 'active') return `Last listed ${money}${suffix}`;
  return `Listed ${money}`;
}

/** Facts and price on one line, for list rows. */
export function formatHomeLine(f: HomeFacts): string {
  return [formatFacts(f), formatPrice(f)].filter(Boolean).join(' · ');
}

function trimNumber(n: number): string {
  return String(Number(n.toFixed(2)));
}

export interface FactTile {
  label: string;
  value: string;
}

/**
 * Facts as large-number tiles for a home's header: Beds, Baths, Sq ft, Price.
 * Unknown facts are left out. The price label says what kind of price it is.
 */
export function factTiles(f: HomeFacts): FactTile[] {
  const tiles: FactTile[] = [];
  if (f.beds != null) tiles.push({ label: Number(f.beds) === 1 ? 'Bed' : 'Beds', value: trimNumber(Number(f.beds)) });
  if (f.baths != null) tiles.push({ label: Number(f.baths) === 1 ? 'Bath' : 'Baths', value: trimNumber(Number(f.baths)) });
  if (f.sqft != null) tiles.push({ label: 'Sq ft', value: Number(f.sqft).toLocaleString('en-US') });
  if (f.price != null) {
    const year = f.price_date?.slice(0, 4);
    let label = 'Listed';
    if (f.price_kind === 'last_sale') label = year ? `Sold ${year}` : 'Sold';
    else if (f.listing_status && f.listing_status.toLowerCase() !== 'active') label = year ? `Listed ${year}` : 'Last listed';
    tiles.push({ label, value: formatMoney(Number(f.price)) });
  }
  return tiles;
}

/** Local midnight on the Monday of `now`'s week ("this week" on the Tour page). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** History section title: "TODAY", "YESTERDAY", "SEPTEMBER 21" (with the year if not this year). */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts).toUpperCase();
}

/** "4:42 PM". */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Items grouped into consecutive day sections, newest first (input must be newest first). */
export function groupByDay<T>(items: T[], dateOf: (item: T) => string, now: Date = new Date()): { title: string; items: T[] }[] {
  const sections: { title: string; items: T[] }[] = [];
  for (const item of items) {
    const title = dayHeading(dateOf(item), now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.items.push(item);
    else sections.push({ title, items: [item] });
  }
  return sections;
}

/**
 * Two traits for a history row, like the mockup's "Open layout · Small backyard":
 * the first thing liked and the first concern, topped up from other points.
 */
export function traitsLine(items: { kind: 'liked' | 'concern' | 'question'; text: string; deleted?: boolean; sort?: number }[]): string {
  const live = items.filter((i) => !i.deleted).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const picks: string[] = [];
  const liked = live.find((i) => i.kind === 'liked');
  const concern = live.find((i) => i.kind === 'concern');
  if (liked) picks.push(liked.text);
  if (concern) picks.push(concern.text);
  for (const i of live) {
    if (picks.length >= 2) break;
    if (!picks.includes(i.text)) picks.push(i.text);
  }
  return picks.slice(0, 2).join(' · ');
}
