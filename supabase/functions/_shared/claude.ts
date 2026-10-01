// Turns a buyer's spoken reaction into a structured note with Claude.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { NOTE_SCHEMA, type ModelNote } from './note.ts';
import { RANKING_SCHEMA, type RankingOutput } from './ranking.ts';

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

// ---------------------------------------------------------------------------
// Ranking conversation
// ---------------------------------------------------------------------------

export const RANKING_MODEL = Deno.env.get('RANKING_MODEL') ?? 'claude-opus-5';

const RANKING_SYSTEM_PROMPT = `You are NORA, helping a home buyer decide between homes they have toured. You have each home's public facts (beds, baths, size, price) and the buyer's own notes from their visits: what they liked, what concerned them, questions, and personal notes.

Your job in this conversation:
1. Rank all of the buyer's homes from best to worst fit for them, every turn.
2. Learn what the buyer needs and how much each thing matters, and keep the ranking in line with it.
3. Explain clearly why the top homes are at the top.

How to work:
- First turn: infer likely priorities from the notes (things they praised or worried about repeatedly, deal-breakers they mentioned) and give a recommended ranking. Say it's a starting point.
- Ask one short, specific question per turn that would most change the ranking (for example, a trade-off between two top homes: "Is the bigger yard at Laredo Rd worth the longer commute?"). Don't repeat a question already answered.
- When the buyer tells you something, update the priorities and re-rank. Say plainly what moved and why ("Moved Laredo Rd to #1 because you said a yard matters more than size").
- If the buyer insists a home belongs at a certain position, respect it and record the preference behind it.
- Ground every reason in the buyer's own notes or the listed facts. Never invent features, prices, commute times, schools, or neighborhood facts. If something important is unknown, say so and suggest asking their agent.
- Treat old or inactive listing prices as historical, not current asking prices.
- A home with few notes can't be judged confidently; say so rather than guessing.

Output fields:
- reply: what you say to the buyer, conversational and plain, under 120 words. Don't list the whole ranking in it; the app shows the ranking separately.
- ranking: every home exactly once, rank 1 = best fit. reason: one or two sentences for that home, specific to it; for the top three, explain what puts it ahead of the others.
- fit: strong, good or weak, relative to the buyer's priorities.
- priorities: the full, current list of what matters to the buyer (not just new ones), each with importance (must, high, medium, low) and evidence (a few words: what they said or noted). Drop priorities the buyer has said don't matter.
- question: your one follow-up question, or an empty string if nothing useful is left to ask.
- suggestions: two or three short replies the buyer could send with one tap, written in the buyer's own voice (first person), each under 8 words, answering your question or accepting your offer. Make them meaningfully different (for example "Yes, compare the yards", "Commute matters more", "Both matter equally"). Empty list if there's no question.`;

export interface RankingTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function rankHomes(params: {
  dossier: string;
  priorities: string; // current learned priorities as text
  history: RankingTurn[]; // oldest first; must end with the buyer's latest message
}): Promise<{ output: RankingOutput; model: string }> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  const response = await client.beta.messages.create({
    model: RANKING_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium', // conversational: keep replies quick
      format: { type: 'json_schema', schema: RANKING_SCHEMA as unknown as Record<string, unknown> },
    },
    system: [
      { type: 'text', text: RANKING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: `The buyer's homes:\n\n${params.dossier}\n\nWhat you have learned about the buyer so far:\n${params.priorities}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: params.history.map((t) => ({ role: t.role, content: t.content })),
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined to rank (${response.stop_details?.category ?? 'unknown'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Claude ranking was cut off at max_tokens');

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    const output = JSON.parse(text);
    if (typeof output.reply !== 'string' || !Array.isArray(output.ranking)) throw new Error('shape');
    return { output, model: response.model };
  } catch {
    throw new Error('Claude ranking did not match the schema');
  }
}
