// Pure transcript helpers. No Deno or npm imports so they can be unit-tested with Vitest.

export interface Utterance {
  start: number; // seconds from the start of the clip
  end: number;
  text: string;
}

export function cleanUtterances(utterances: Utterance[]): Utterance[] {
  return utterances
    .map((u) => ({ start: round2(u.start), end: round2(u.end), text: u.text.trim() }))
    .filter((u) => u.text.length > 0);
}

export function fullText(utterances: Utterance[]): string {
  return utterances.map((u) => u.text).join(' ');
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
