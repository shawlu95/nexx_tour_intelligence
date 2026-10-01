// Turns an uploaded reaction clip into a note: transcribe, summarize, check, save.
//
// POST { visit_id, regenerate? }
//   - called by the app after the clip is uploaded, and when the buyer taps "Try again"
//   - called by the app with regenerate: true to rewrite the note from the saved
//     transcript while keeping the buyer's own edits
//   - called by the sweep function (service key) to retry stuck or failed visits
//
// Replies 202 straight away and does the work in the background; the app follows
// progress through the visit's status.
import { writeNote } from '../_shared/claude.ts';
import { STT_MODEL, STT_PROVIDER, transcribeUrl } from '../_shared/deepgram.ts';
import { checkItems, planRegeneration, PROMPT_VERSION, type ExistingItem, type NoteItem } from '../_shared/note.ts';
import { sendPush } from '../_shared/push.ts';
import { lookUpFacts } from '../_shared/rentcast.ts';
import {
  adminClient,
  corsHeaders,
  friendlyError,
  isServiceCall,
  json,
  runInBackground,
  setStatus,
  userIdFrom,
} from '../_shared/runtime.ts';
import { cleanUtterances, fullText } from '../_shared/transcript.ts';

const STALE_MS = 5 * 60 * 1000;
const MAX_AUTOMATIC_ATTEMPTS = 3;
const NO_SPEECH = 'No speech was picked up in this recording.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const service = isServiceCall(req);
  const userId = service ? null : await userIdFrom(req);
  if (!service && !userId) return json({ error: 'Sign in again to continue.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { visit_id?: string; regenerate?: boolean };
  const visitId = body.visit_id;
  const regenerate = body.regenerate === true;
  if (!visitId) return json({ error: 'visit_id is required' }, 400);

  const db = adminClient();
  const { data: visit, error } = await db
    .from('visits')
    .select('*, properties(address_line, unit, city)')
    .eq('id', visitId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!visit || (userId && visit.user_id !== userId)) return json({ error: 'Visit not found' }, 404);
  if (!visit.audio_path) return json({ error: 'The recording has not finished uploading yet.' }, 409);

  if (visit.status === 'ready' && !regenerate) return json({ status: 'ready' });
  const inFlight = visit.status === 'processing' && Date.now() - new Date(visit.status_updated_at).getTime() < STALE_MS;
  if (inFlight) return json({ status: 'processing' }, 202);

  // Automatic retries stop after a few attempts; a buyer's tap always gets a fresh run.
  if (service && visit.attempts >= MAX_AUTOMATIC_ATTEMPTS) {
    if (visit.status !== 'failed') {
      await setStatus(db, visitId, 'failed', { error: 'Processing failed. Tap Try again.' });
    }
    return json({ status: 'failed' });
  }
  const attempts = service ? visit.attempts + 1 : 1;
  await setStatus(db, visitId, 'processing', { attempts, error: null });

  runInBackground(
    (async () => {
      try {
        // 1. Transcript: reuse the saved one when regenerating, otherwise transcribe.
        let transcript: string | null = null;
        if (regenerate) {
          const { data } = await db.from('transcripts').select('full_text').eq('visit_id', visitId).maybeSingle();
          transcript = data?.full_text ?? null;
        }
        if (transcript === null) {
          const { data: signed, error: signError } = await db.storage
            .from('audio')
            .createSignedUrl(visit.audio_path, 10 * 60);
          if (signError || !signed) throw new Error(`Could not sign audio URL: ${signError?.message}`);
          const utterances = cleanUtterances(await transcribeUrl(signed.signedUrl));
          transcript = fullText(utterances);
          const { error: tError } = await db.from('transcripts').upsert({
            visit_id: visitId,
            user_id: visit.user_id,
            utterances,
            full_text: transcript,
            provider: STT_PROVIDER,
            model: STT_MODEL,
          });
          if (tError) throw tError;
        }

        // 2. Note: summarize, then keep only points whose quote is in the transcript.
        const p = visit.properties as { address_line: string; unit: string | null; city: string | null } | null;
        const address = [p?.address_line, p?.unit ? `Unit ${p.unit}` : null, p?.city].filter(Boolean).join(', ');
        let overall = NO_SPEECH;
        let model: string | null = null;
        let items: NoteItem[] = [];
        if (transcript.trim().length > 0) {
          const result = await writeNote({ transcript, address });
          const checked = checkItems(result.note.items, transcript);
          if (checked.dropped.length > 0) console.warn(`dropped ${checked.dropped.length} unsupported items`, visitId);
          overall = result.note.overall.trim() || NO_SPEECH;
          model = result.model;
          items = checked.kept;
        }

        // 3. Save, keeping anything the buyer added, edited, or deleted.
        const { data: note, error: nError } = await db
          .from('notes')
          .upsert(
            { visit_id: visitId, user_id: visit.user_id, overall, model, prompt_version: PROMPT_VERSION },
            { onConflict: 'visit_id' },
          )
          .select('id')
          .single();
        if (nError) throw nError;

        const { data: existing, error: eError } = await db
          .from('note_items')
          .select('id, origin, edited, deleted, quote')
          .eq('note_id', note.id);
        if (eError) throw eError;

        const plan = planRegeneration((existing ?? []) as ExistingItem[], items);
        if (plan.removeIds.length > 0) {
          const { error: dError } = await db.from('note_items').delete().in('id', plan.removeIds);
          if (dError) throw dError;
        }
        if (plan.insert.length > 0) {
          const { error: iError } = await db.from('note_items').insert(
            plan.insert.map((item, i) => ({
              note_id: note.id,
              user_id: visit.user_id,
              kind: item.kind,
              text: item.text,
              quote: item.quote,
              origin: 'ai',
              sort: i,
            })),
          );
          if (iError) throw iError;
        }

        await setStatus(db, visitId, 'ready', { error: null });

        if (!regenerate) {
          const { data: profile } = await db.from('profiles').select('push_token').eq('id', visit.user_id).maybeSingle();
          await sendPush(profile?.push_token, 'Your note is ready', `See what you said about ${p?.address_line ?? 'the home'}.`, {
            visitId,
          });
        }

        // Beds, baths, size and price for the home, once per property. Best effort.
        await lookUpFacts(db, visit.property_id);
      } catch (e) {
        console.error('process-visit failed', visitId, e);
        await setStatus(db, visitId, 'failed', { error: friendlyError(e) });
      }
    })(),
  );

  return json({ status: 'processing' }, 202);
});
