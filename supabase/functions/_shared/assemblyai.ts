// Speech-to-text with AssemblyAI's pre-recorded API. Universal-3.5 Pro detects the
// language on its own and handles speech that switches between English and Chinese.
import { env } from './runtime.ts';
import type { Utterance } from './transcript.ts';

export const STT_PROVIDER = 'assemblyai';
export const STT_MODEL = 'universal-3-5-pro';

const API = 'https://api.assemblyai.com/v2';
const POLL_MS = 1500;
const TIMEOUT_MS = 120_000;

interface Transcript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string | null;
  error?: string;
  audio_duration?: number | null; // seconds
}

interface Sentences {
  sentences?: { text: string; start: number; end: number }[]; // milliseconds
}

/** Transcribes the audio file at `audioUrl` (a signed storage URL). */
export async function transcribeUrl(audioUrl: string): Promise<Utterance[]> {
  const deadline = Date.now() + TIMEOUT_MS;
  let t = await call<Transcript>('/transcript', {
    method: 'POST',
    body: JSON.stringify({
      audio_url: audioUrl,
      // Universal-2 is AssemblyAI's fallback for languages Universal-3.5 Pro doesn't cover.
      speech_models: [STT_MODEL, 'universal-2'],
      language_detection: true,
    }),
  });
  while (t.status === 'queued' || t.status === 'processing') {
    if (Date.now() > deadline) throw new Error(`AssemblyAI timed out on transcript ${t.id}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
    t = await call<Transcript>(`/transcript/${t.id}`);
  }
  if (t.status !== 'completed') throw new Error(`AssemblyAI failed: ${t.error ?? t.status}`);

  const text = t.text?.trim() ?? '';
  if (!text) return [];
  // Sentences with timings, for the transcript view. Fall back to the plain text.
  const { sentences = [] } = await call<Sentences>(`/transcript/${t.id}/sentences`);
  if (sentences.length > 0) {
    return sentences.map((s) => ({ start: s.start / 1000, end: s.end / 1000, text: s.text }));
  }
  return [{ start: 0, end: t.audio_duration ?? 0, text }];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: env('ASSEMBLYAI_API_KEY'), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`AssemblyAI returned ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
