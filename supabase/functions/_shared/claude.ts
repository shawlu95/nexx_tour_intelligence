// Turns a buyer's spoken reaction into a structured note with Claude.
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { NOTE_SCHEMA, type ModelNote } from './note.ts';
import { CHAT_SCHEMA, RANK_SCHEMA, type ChatOutput, type RankOutput } from './ranking.ts';

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
// Ranking and Discuss
// ---------------------------------------------------------------------------

export const RANKING_MODEL = Deno.env.get('RANKING_MODEL') ?? 'claude-opus-5';

// Shared by ranking and Discuss turns; kept byte-for-byte stable for the prompt cache.
const RANKING_SYSTEM_PROMPT = `You are NORA, helping a home buyer decide between homes they have toured. You have each home's public facts (beds, baths, size, price) and the buyer's own notes from their visits: what they liked, what concerned them, questions, and personal notes.

You do two kinds of turns, and each request says which one:
- Ranking: rank all of the buyer's homes from best to worst fit, using everything learned so far, including the Discuss conversation.
- Discuss: talk with the buyer to refine what matters to them and why homes rank where they do. Don't re-rank in a Discuss turn; the buyer re-ranks when they're ready.

Always:
- Ground everything in the buyer's own notes or the listed facts. Never invent features, prices, commute times, schools, or neighborhood facts. If something important is unknown, say so and suggest asking their agent.
- Treat old or inactive listing prices as historical, not current asking prices.
- A home with few notes can't be judged confidently; say so rather than guessing.
- Keep a full, current list of the buyer's priorities: each with importance (must, high, medium, low) and evidence (a few words: what they said or noted). Infer likely priorities from the notes at first; update them as the buyer tells you more; drop ones the buyer says don't matter. If the buyer insists a home belongs at a certain position, record the preference behind it.`;

const RANK_MODE = `This is a Ranking turn. Output:
- headline: one short sentence naming the best fit, under 10 words (e.g. "Laredo Rd is your best fit").
- ranking: every home exactly once, rank 1 = best fit.
  - label: 2 to 4 words that sum up why it's at that rank (e.g. "Best overall fit", "Strong contender", "Great location", "Too much renovation"). No full sentences.
  - pros: up to 3 short tags, 1 to 3 words each, the strengths that matter to this buyer (e.g. "Big yard", "Bright kitchen").
  - cons: up to 3 short tags, the weaknesses that matter to this buyer (e.g. "Small backyard", "Power lines").
  - score: 0 to 10, one decimal, how well the home fits this buyer's priorities. It's a rough guide for comparison, not a precise measure: 10 = matches everything that matters, 5 = mixed, 0 = fails a must-have. Scores must not increase down the ranking. Make the gaps meaningful: homes that are a close call get close scores (8.4 vs 8.1); a clear difference gets a big gap (8.4 vs 5.2).
- priorities: the full current list.`;

const CHAT_MODE = `This is a Discuss turn. Output:
- reply: what you say to the buyer, conversational and plain, under 90 words. Explain reasoning when asked ("Why is Bonita #2?"), surface trade-offs between top homes, and confirm what you've learned. Don't list the whole ranking.
- question: one short, specific question that would most change the ranking (often a trade-off between two top homes), or an empty string if nothing useful is left to ask. Don't repeat a question already answered.
- suggestions: two or three short replies the buyer could send with one tap, in the buyer's own voice (first person), each under 8 words, meaningfully different. Empty list if there's no question.
- priorities: the full current list, updated with what the buyer just said.`;

export interface RankingTurn {
  role: 'user' | 'assistant';
  content: string;
}

async function rankingCall<T>(mode: 'rank' | 'chat', params: { dossier: string; priorities: string; history: RankingTurn[] }) {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const response = await client.beta.messages.create({
    model: RANKING_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium', // conversational: keep turns quick
      format: {
        type: 'json_schema',
        schema: (mode === 'rank' ? RANK_SCHEMA : CHAT_SCHEMA) as unknown as Record<string, unknown>,
      },
    },
    system: [
      { type: 'text', text: RANKING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: `The buyer's homes:\n\n${params.dossier}\n\nWhat you have learned about the buyer so far:\n${params.priorities}`,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: mode === 'rank' ? RANK_MODE : CHAT_MODE },
    ],
    messages: params.history.map((t) => ({ role: t.role, content: t.content })),
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined (${response.stop_details?.category ?? 'unknown'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Claude response was cut off at max_tokens');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let output: T;
  try {
    output = JSON.parse(text) as T;
  } catch {
    throw new Error('Claude response was not valid JSON');
  }
  return { output, model: response.model };
}

export async function rankHomes(params: { dossier: string; priorities: string; history: RankingTurn[] }) {
  const r = await rankingCall<RankOutput>('rank', params);
  if (typeof r.output.headline !== 'string' || !Array.isArray(r.output.ranking)) throw new Error('Ranking did not match the schema');
  return r;
}

export async function discussHomes(params: { dossier: string; priorities: string; history: RankingTurn[] }) {
  const r = await rankingCall<ChatOutput>('chat', params);
  if (typeof r.output.reply !== 'string') throw new Error('Discuss reply did not match the schema');
  return r;
}
