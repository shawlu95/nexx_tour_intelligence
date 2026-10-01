// Permanently deletes the signed-in user's audio, data, and sign-in record.
import { adminClient, corsHeaders, json, userIdFrom } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const userId = await userIdFrom(req);
  if (!userId) return json({ error: 'Sign in again to continue.' }, 401);

  const db = adminClient();

  // Remove every audio file under <user_id>/, a page at a time.
  for (;;) {
    const { data: files, error } = await db.storage.from('audio').list(userId, { limit: 100 });
    if (error) return json({ error: `Could not list audio: ${error.message}` }, 500);
    if (!files || files.length === 0) break;
    const { error: rmError } = await db.storage.from('audio').remove(files.map((f) => `${userId}/${f.name}`));
    if (rmError) return json({ error: `Could not delete audio: ${rmError.message}` }, 500);
  }

  // Deleting the auth user cascades to every table.
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return json({ error: `Could not delete account: ${error.message}` }, 500);

  return json({ deleted: true });
});
