// Runs every 5 minutes (pg_cron, see supabase/setup/cron.sql). Restarts visits
// that are stuck, failed with automatic attempts left, or uploaded but never
// submitted (for example, the app was closed right after the upload).
import { adminClient, corsHeaders, invokeFunction, isServiceCall, json } from '../_shared/runtime.ts';

const BATCH = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isServiceCall(req)) return json({ error: 'Forbidden' }, 403);

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
