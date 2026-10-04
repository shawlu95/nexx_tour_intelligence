// Shared runtime helpers for Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const SUPABASE_URL = () => env('SUPABASE_URL');
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY');
const ANON_KEY = () => Deno.env.get('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');

/** Service-role client. Bypasses RLS; only use after checking who is asking. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL(), SERVICE_KEY(), { auth: { persistSession: false } });
}

/** Returns the signed-in user's id, or null if the bearer token is not a valid user session. */
export async function userIdFrom(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL(), ANON_KEY(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/** True when the request carries the service-role key (function-to-function calls). */
export function isServiceCall(req: Request): boolean {
  return req.headers.get('Authorization') === `Bearer ${SERVICE_KEY()}`;
}

/** Fire-and-forget call to another Edge Function with the service-role key. */
export async function invokeFunction(name: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL()}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} returned ${res.status}: ${await res.text()}`);
}

/** Runs work after the response is sent, within the function's wall-clock limit. */
export function runInBackground(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  const guarded = promise.catch((e) => console.error('background task failed', e));
  if (runtime) runtime.waitUntil(guarded);
}

export type VisitStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'needs_consent';

export async function setStatus(
  db: SupabaseClient,
  visitId: string,
  status: VisitStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db
    .from('visits')
    .update({ status, status_updated_at: new Date().toISOString(), ...extra })
    .eq('id', visitId);
  if (error) throw error;
}

/** True when the buyer has allowed AI processing (Privacy & data). Nothing goes to AssemblyAI or Anthropic otherwise. */
export async function hasAiConsent(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from('profiles').select('ai_consent_at').eq('id', userId).maybeSingle();
  if (error) throw error;
  return !!data?.ai_consent_at;
}

export const AI_CONSENT_MESSAGE = 'AI note processing is off. Turn it on in Profile → Privacy & data.';

/**
 * Deletes a visit's original audio once it has been transcribed (NORA keeps only the
 * transcript and note) and clears audio_path so nothing points at the file.
 */
export async function deleteVisitAudio(db: SupabaseClient, visitId: string, path: string): Promise<void> {
  const { error } = await db.storage.from('audio').remove([path]);
  if (error) throw new Error(`Could not delete audio: ${error.message}`);
  const { error: uError } = await db.from('visits').update({ audio_path: null }).eq('id', visitId);
  if (uError) throw uError;
}

/** Turns an internal error into the short message the app shows the buyer. */
export function friendlyError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/assemblyai/i.test(message)) return 'Transcription failed. Tap Try again.';
  if (/anthropic|claude|summar/i.test(message)) return 'Writing the note failed. Tap Try again.';
  return 'Processing failed. Tap Try again.';
}
