// Turns a buyer's spoken reaction into a structured note with Claude.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { NOTE_SCHEMA, type ModelNote } from './note.ts';

export const SUMMARY_MODEL = Deno.env.get('SUMMARY_MODEL') ?? 'claude-opus-5';

// Kept byte-for-byte stable so it can be served from the prompt cache.
const SYSTEM_PROMPT = `You write notes for a home buyer. Right after leaving an open house, the buyer recorded a short spoken reaction (usually under a minute) about the home they just saw.
Your note is their memory aid weeks later and may be sent to their buyer's agent.

Write:
- overall: one or two plain sentences with the buyer's overall impression, in second person ("You liked...", "Your main doubt was...").
- items: the specific points worth remembering, each one of:
  - liked: something the buyer liked.
  - concern: something the buyer disliked, doubted, or worried about.
  - question: something the buyer wants to find out or ask their agent.

Rules:
- Only include what the buyer actually said. Never add features, prices, or opinions that are not in the transcript.
- Each item's text is short (under 12 words), concrete, and written for the buyer ("Large kitchen island", "Power lines along the back fence").
- quote is a verbatim excerpt (4 to 20 words) copied exactly from the transcript, showing where the point came from.
- One point per item. Merge repeats of the same point. Keep the order in which they were said.
- Skip filler and false starts.
- If the buyer said nothing about the home, say so in overall and return an empty items list.`;

export async function writeNote(params: { transcript: string; address: string }): Promise<{ note: ModelNote; model: string }> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  const response = await client.beta.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 16000,
    // Re-run on Anthropic's recommended fallback model if a safety classifier declines.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: NOTE_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `Home: ${params.address}\n\nTranscript:\n${params.transcript}` }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined to summarize (${response.stop_details?.category ?? 'unknown'})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude summary was cut off at max_tokens');
  }

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: ModelNote;
  try {
    parsed = JSON.parse(text) as ModelNote;
  } catch {
    throw new Error('Claude summary was not valid JSON');
  }
  if (typeof parsed.overall !== 'string' || !Array.isArray(parsed.items)) {
    throw new Error('Claude summary did not match the note schema');
  }
  return { note: parsed, model: response.model };
}
