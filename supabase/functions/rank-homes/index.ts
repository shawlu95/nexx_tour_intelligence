// Ranking and Discuss.
//
// POST { action: 'rank' }                  rank every home with concise labels and pro/con tags,
//                                          using the priorities and the Discuss conversation so far
// POST { action: 'chat', message: string } a Discuss turn: NORA replies and refines the priorities,
//                                          without re-ranking
// Older app builds send 'start' / 'refresh' (= rank) and 'send' (= chat).
//
// Answers synchronously (usually 10–30 seconds) with the saved turn(s).
import { discussHomes, rankHomes, type RankingTurn } from '../_shared/claude.ts';
import {
  buildDossier,
  normalizePriorities,
  normalizeRanking,
  normalizeSuggestions,
  replayAssistantTurn,
  type DossierHome,
  type Priority,
  type StoredRankedHome,
} from '../_shared/ranking.ts';
import { adminClient, corsHeaders, json, userIdFrom } from '../_shared/runtime.ts';

const MAX_MESSAGE_CHARS = 2000;
const HISTORY_TURNS = 30;
const DAILY_TURN_LIMIT = 60; // protects against runaway API cost
// Not stored: the request a ranking turn answers.
const RANK_PROMPT = 'Rank all of my homes now, using everything you know about what matters to me.';
const ACTIONS: Record<string, 'rank' | 'chat'> = { rank: 'rank', start: 'rank', refresh: 'rank', chat: 'chat', send: 'chat' };

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ranking: StoredRankedHome[] | null;
  question: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const userId = await userIdFrom(req);
  if (!userId) return json({ error: 'Sign in again to continue.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { action?: string; message?: string };
  const mode = ACTIONS[body.action ?? 'chat'];
  const message = (body.message ?? '').trim();
  if (!mode) return json({ error: 'Unknown action' }, 400);
  if (mode === 'chat' && !message) return json({ error: 'Type a message first.' }, 400);
  if (message.length > MAX_MESSAGE_CHARS) return json({ error: 'That message is too long.' }, 400);

  const db = adminClient();

  // Daily limit on model calls per buyer.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('ranking_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_TURN_LIMIT) {
    return json({ error: "You've reached today's limit for the ranking chat. Try again tomorrow." }, 429);
  }

  // The buyer's homes with notes, newest visit first within each home.
  const { data: props, error: pError } = await db
    .from('properties')
    .select(
      'id, address_line, unit, city, beds, baths, sqft, price, price_kind, price_date, listing_status, visits(recorded_at, status, notes(overall, personal_note, note_items(kind, text, deleted)))',
    )
    .eq('user_id', userId);
  if (pError) return json({ error: pError.message }, 500);

  type Raw = {
    id: string;
    address_line: string;
    unit: string | null;
    city: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    price: number | null;
    price_kind: 'list' | 'last_sale' | null;
    price_date: string | null;
    listing_status: string | null;
    visits: {
      recorded_at: string;
      status: string;
      // One note per visit; PostgREST returns it as an object, older clients as a one-item array.
      notes: RawNote | RawNote[] | null;
    }[];
  };
  type RawNote = { overall: string; personal_note: string; note_items: { kind: 'liked' | 'concern' | 'question'; text: string; deleted: boolean }[] };
  const noteOf = (n: RawNote | RawNote[] | null): RawNote | null => (Array.isArray(n) ? (n[0] ?? null) : n);
  const homes: DossierHome[] = ((props ?? []) as unknown as Raw[])
    .map((p) => ({
      id: p.id,
      label: p.unit ? `${p.address_line}, Unit ${p.unit}` : p.address_line,
      city: p.city,
      beds: p.beds,
      baths: p.baths,
      sqft: p.sqft,
      price: p.price,
      price_kind: p.price_kind,
      price_date: p.price_date,
      listing_status: p.listing_status,
      visits: (p.visits ?? [])
        .map((v) => ({ ...v, note: noteOf(v.notes) }))
        .filter((v) => v.status === 'ready' && v.note)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
        .map((v) => ({
          recorded_at: v.recorded_at,
          overall: v.note!.overall,
          personal_note: v.note!.personal_note,
          items: (v.note!.note_items ?? []).filter((i) => !i.deleted).map((i) => ({ kind: i.kind, text: i.text })),
        })),
    }))
    .filter((h) => h.visits.length > 0);

  if (homes.length < 2) {
    return json({ error: 'Record reactions to at least two homes to get a ranking.' }, 409);
  }

  const { data: history } = await db
    .from('ranking_messages')
    .select('role, content, ranking, question')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS);
  const past = ((history ?? []) as StoredMessage[]).reverse();

  const { data: pri } = await db.from('buyer_priorities').select('priorities').eq('user_id', userId).maybeSingle();
  const known = (pri?.priorities ?? []) as Priority[];
  const prioritiesText = known.length
    ? known.map((p) => `- ${p.label} (${p.importance}): ${p.evidence}`).join('\n')
    : 'Nothing yet.';

  const labels = new Map(homes.map((h) => [h.id, h.label]));
  const turns: RankingTurn[] = past.map((m) =>
    m.role === 'assistant'
      ? { role: 'assistant', content: replayAssistantTurn(m.content, m.ranking, m.question, labels) }
      : { role: 'user', content: m.content },
  );
  if (turns.length === 0 || turns[0].role !== 'user') turns.unshift({ role: 'user', content: RANK_PROMPT });
  // The model answers the last user turn: the buyer's message, or the (unstored) ranking request.
  turns.push({ role: 'user', content: mode === 'chat' ? message : RANK_PROMPT });
  const context = { dossier: buildDossier(homes), priorities: prioritiesText, history: turns };

  // Save the buyer's message and NORA's answer together, so a failed call leaves no half turn.
  const rows: Record<string, unknown>[] = [];
  let priorities: Priority[];
  try {
    if (mode === 'rank') {
      const result = await rankHomes(context);
      priorities = normalizePriorities(result.output.priorities);
      rows.push({
        user_id: userId,
        role: 'assistant',
        content: result.output.headline.trim(),
        ranking: normalizeRanking(result.output.ranking, homes.map((h) => h.id)),
        based_on: homes.map((h) => h.id),
        model: result.model,
      });
    } else {
      const result = await discussHomes(context);
      priorities = normalizePriorities(result.output.priorities);
      rows.push({ user_id: userId, role: 'user', content: message });
      rows.push({
        user_id: userId,
        role: 'assistant',
        content: result.output.reply.trim(),
        question: result.output.question.trim() || null,
        suggestions: normalizeSuggestions(result.output.suggestions),
        based_on: homes.map((h) => h.id),
        model: result.model,
      });
    }
  } catch (e) {
    console.error('rank-homes failed', userId, mode, e);
    return json({ error: "NORA couldn't answer just now. Try again in a moment." }, 502);
  }
  const { data: saved, error: sError } = await db.from('ranking_messages').insert(rows).select('*');
  if (sError) return json({ error: sError.message }, 500);

  const { error: prError } = await db
    .from('buyer_priorities')
    .upsert({ user_id: userId, priorities, updated_at: new Date().toISOString() });
  if (prError) console.error('saving priorities failed', userId, prError);

  return json({ messages: saved, priorities });
});
