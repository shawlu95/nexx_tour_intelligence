// Upload queue. Moves each saved recording (or typed note) through:
//   saved → property → visit → uploaded → submitted → (removed once the note is ready)
// A typed note travels with the visit row, so it has no audio upload.
// Every step is idempotent, so a crash or lost connection just means the step runs again.
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { normalizedKey } from './address';
import { retryDelayMs } from './backoff';
import { geocodeAddress } from './geo';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { listPending, removePending, updatePending, type PendingVisit } from './localdb';
import { callFunction, supabase } from './supabase';

const listeners = new Set<() => void>();

/** Subscribe to queue changes (to refresh screens). Returns an unsubscribe function. */
export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** Folder holding recordings until the server has processed them. */
export function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, 'recordings');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function audioPathFor(userId: string, visitId: string): string {
  return `${userId}/${visitId}.m4a`;
}

async function ensureProperty(v: PendingVisit): Promise<string> {
  if (v.property_id) return v.property_id;
  const d = v.property_draft;
  if (!d) throw new Error('Missing address for this recording.');
  // Save the house's own coordinates, not where the phone was when the home was added.
  const house = await geocodeAddress(d);
  const { data, error } = await supabase
    .from('properties')
    .upsert(
      {
        address_line: d.addressLine.trim(),
        unit: d.unit.trim() || null,
        city: d.city.trim() || null,
        region: d.region.trim() || null,
        postal_code: d.postalCode.trim() || null,
        latitude: house?.latitude ?? d.latitude,
        longitude: house?.longitude ?? d.longitude,
        coords_source: house ? 'address' : 'device',
        normalized_key: normalizedKey(d),
      },
      { onConflict: 'user_id,normalized_key' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function ensureVisit(v: PendingVisit, propertyId: string) {
  const { error } = await supabase.from('visits').upsert(
    {
      id: v.id,
      property_id: propertyId,
      recorded_at: v.recorded_at,
      duration_seconds: v.duration_seconds,
      typed_note: v.typed_text,
      status: 'uploading',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function uploadAudio(v: PendingVisit) {
  const file = new File(v.file_uri);
  if (!file.exists) throw new Error('The recording file is missing on this phone.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to upload.');

  const path = audioPathFor(v.user_id, v.id);
  const result = await file.upload(`${SUPABASE_URL}/storage/v1/object/audio/${path}`, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'audio/mp4',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'audio/mp4',
      'x-upsert': 'true',
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed (${result.status}).`);
  }
  const { error } = await supabase.from('visits').update({ audio_path: path }).eq('id', v.id);
  if (error) throw error;
}

async function step(v: PendingVisit): Promise<void> {
  let current = v;
  if (current.stage === 'saved') {
    const propertyId = await ensureProperty(current);
    await updatePending(current.id, { property_id: propertyId, stage: 'property' });
    current = { ...current, property_id: propertyId, stage: 'property' };
  }
  if (current.stage === 'property') {
    await ensureVisit(current, current.property_id!);
    await updatePending(current.id, { stage: 'visit' });
    current = { ...current, stage: 'visit' };
  }
  if (current.stage === 'visit') {
    if (!current.typed_text) await uploadAudio(current);
    await updatePending(current.id, { stage: 'uploaded' });
    current = { ...current, stage: 'uploaded' };
  }
  if (current.stage === 'uploaded') {
    await callFunction('process-visit', { visit_id: current.id });
    await updatePending(current.id, { stage: 'submitted', attempts: 0, last_error: null });
    current = { ...current, stage: 'submitted' };
  }
  if (current.stage === 'submitted') {
    // Keep the local copy until the note exists, then free the space.
    const { data } = await supabase.from('visits').select('status').eq('id', current.id).maybeSingle();
    if (data?.status === 'ready') {
      if (current.file_uri) {
        const file = new File(current.file_uri);
        if (file.exists) file.delete();
      }
      await removePending(current.id);
    }
  }
}

let running: Promise<void> | null = null;

/** Processes every queued recording that is due. Safe to call often. */
export function runQueue(options: { force?: boolean } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;
      const net = await Network.getNetworkStateAsync().catch(() => null);
      if (net && net.isInternetReachable === false) return;

      const now = Date.now();
      for (const v of await listPending(userId)) {
        if (!options.force && v.next_attempt_at > now && v.stage !== 'submitted') continue;
        try {
          await step(v);
        } catch (e) {
          const attempts = v.attempts + 1;
          await updatePending(v.id, {
            attempts,
            next_attempt_at: Date.now() + retryDelayMs(attempts),
            last_error: e instanceof Error ? e.message : String(e),
          });
        }
        notify();
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Starts the triggers that keep the queue moving: foreground and reconnect. Call once. */
export function startQueueTriggers(): () => void {
  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void runQueue();
  });
  const netSub = Network.addNetworkStateListener((s) => {
    if (s.isInternetReachable) void runQueue({ force: true });
  });
  const timer = setInterval(() => void runQueue(), 20_000);
  void runQueue();
  return () => {
    appSub.remove();
    netSub.remove();
    clearInterval(timer);
  };
}
