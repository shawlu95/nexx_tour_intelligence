// Speech-to-text with Deepgram's pre-recorded API.
import { env } from './runtime.ts';
import type { Utterance } from './transcript.ts';

export const STT_PROVIDER = 'deepgram';
export const STT_MODEL = 'nova-3';

interface DeepgramResponse {
  results?: {
    utterances?: { start: number; end: number; transcript: string }[];
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
  metadata?: { duration?: number };
}

/** Transcribes the audio file at `audioUrl` (a signed storage URL). */
export async function transcribeUrl(audioUrl: string): Promise<Utterance[]> {
  const params = new URLSearchParams({
    model: STT_MODEL,
    smart_format: 'true',
    punctuate: 'true',
    utterances: 'true',
    language: 'en',
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${env('DEEPGRAM_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: audioUrl }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Deepgram returned ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as DeepgramResponse;

  const utterances = body.results?.utterances ?? [];
  if (utterances.length > 0) {
    return utterances.map((u) => ({ start: u.start, end: u.end, text: u.transcript }));
  }
  // No utterance breakdown: fall back to the plain transcript.
  const text = body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  return text ? [{ start: 0, end: body.metadata?.duration ?? 0, text }] : [];
}
