// "Edit reaction" (updated mockup): the buyer rewrites their reaction in their own
// words and NORA updates the Liked / Concerns bubbles to match.
//
// POST { visit_id, text, save? }
//   - without save: a preview. Returns the bubbles NORA reads from the text; nothing is stored.
//   - with save: true: stores the text as the note's reaction (marked as the buyer's own)
//     and replaces the note's points with the ones read from it.
//
// Every bubble must quote the buyer's text (checkItems), so NORA can't add points
// the buyer didn't write. Needs AI consent, like every other AI call.
import { writeNote } from '../_shared/claude.ts';
import { checkItems } from '../_shared/note.ts';
import { adminClient, AI_CONSENT_MESSAGE, corsHeaders, hasAiConsent, json, userIdFrom } from '../_shared/runtime.ts';

const MAX_CHARS = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const userId = await userIdFrom(req);
  if (!userId) return json({ error: 'Sign in again to continue.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { visit_id?: string; text?: string; save?: boolean };
  const text = (body.text ?? '').trim();
  if (!body.visit_id) return json({ error: 'visit_id is required' }, 400);
  if (text.length < 3) return json({ error: 'Write a sentence or two first.' }, 400);
  if (text.length > MAX_CHARS) return json({ error: 'That reaction is too long.' }, 400);

  const db = adminClient();
  const { data: visit, error } = await db
    .from('visits')
    .select('id, user_id, properties(address_line, unit, city), notes(id)')
    .eq('id', body.visit_id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!visit || visit.user_id !== userId) return json({ error: 'Note not found' }, 404);
  if (!(await hasAiConsent(db, userId))) return json({ error: AI_CONSENT_MESSAGE, code: 'ai_consent' }, 403);

  const p = visit.properties as unknown as { address_line: string; unit: string | null; city: string | null } | null;
  const address = [p?.address_line, p?.unit ? `Unit ${p.unit}` : null, p?.city].filter(Boolean).join(', ');
  let items;
  try {
    const result = await writeNote({ transcript: text, address });
    items = checkItems(result.note.items, text).kept;
  } catch (e) {
    console.error('edit-reaction failed', body.visit_id, e);
    return json({ error: "NORA couldn't read that just now. Try again." }, 502);
  }

  if (body.save) {
    const note = (Array.isArray(visit.notes) ? visit.notes[0] : visit.notes) as { id: string } | null;
    if (!note) return json({ error: 'This note isn’t ready yet.' }, 409);
    const { error: nError } = await db.from('notes').update({ overall: text, edited_by_buyer: true }).eq('id', note.id);
    if (nError) return json({ error: nError.message }, 500);
    const { error: dError } = await db.from('note_items').delete().eq('note_id', note.id);
    if (dError) return json({ error: dError.message }, 500);
    if (items.length > 0) {
      const { error: iError } = await db.from('note_items').insert(
        items.map((item, i) => ({
          note_id: note.id,
          user_id: userId,
          kind: item.kind,
          text: item.text,
          quote: item.quote,
          origin: 'ai',
          sort: i,
        })),
      );
      if (iError) return json({ error: iError.message }, 500);
    }
  }

  return json({ items: items.map((i) => ({ kind: i.kind, text: i.text })) });
});
