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
