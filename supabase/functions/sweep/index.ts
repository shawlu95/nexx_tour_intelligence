// Runs every 5 minutes (pg_cron, see supabase/migrations/*_schedule_sweep.sql).
// Restarts visits that are stuck, failed with automatic attempts left, or
// uploaded but never submitted (for example, the app was closed right after the upload).
//
// The scheduler authenticates with its own key (SWEEP_SECRET, sent as
// x-sweep-secret), so the project's service-role key never leaves the server.
import { adminClient, corsHeaders, invokeFunction, json } from '../_shared/runtime.ts';

const BATCH = 20;

function sameSecret(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!sameSecret(req.headers.get('x-sweep-secret'), Deno.env.get('SWEEP_SECRET'))) {
    return json({ error: 'Forbidden' }, 403);
  }

  const db = adminClient();
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  const { data, error } = await db
    .from('visits')
    .select('id')
    .or(
      [
        `and(status.eq.processing,status_updated_at.lt.${minutesAgo(5)})`,
        `and(status.eq.failed,attempts.lt.3,status_updated_at.lt.${minutesAgo(2)})`,
        `and(status.eq.uploading,audio_path.not.is.null,status_updated_at.lt.${minutesAgo(10)})`,
      ].join(','),
    )
    .order('status_updated_at')
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);

  const results = await Promise.allSettled((data ?? []).map((v) => invokeFunction('process-visit', { visit_id: v.id })));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) console.error(`sweep: ${failed} of ${results.length} retries could not be started`);
  return json({ retried: results.length - failed, failed });
});
