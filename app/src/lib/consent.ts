// AI processing consent. NORA sends a recording or typed note, with the confirmed
// address, to AssemblyAI and Anthropic only after the buyer allows it (App Store
// guideline 5.1.2). Stored on the profile so the server enforces it too.
import { useEffect, useState } from 'react';
import { callFunction, supabase } from './supabase';

let current: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

function publish(on: boolean) {
  current = on;
  listeners.forEach((fn) => fn(on));
}

/** Whether AI processing is on, read from the server (null while loading or offline). */
export async function loadAiConsent(): Promise<boolean | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;
  const { data, error } = await supabase.from('profiles').select('ai_consent_at').eq('id', userId).maybeSingle();
  if (error) return current;
  publish(!!data?.ai_consent_at);
  return current;
}

/**
 * Turns AI processing on or off. Turning it on also starts the notes that were
 * saved while it was off.
 */
export async function setAiConsent(on: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Sign in again to continue.');
  const { error } = await supabase
    .from('profiles')
    .update({ ai_consent_at: on ? new Date().toISOString() : null })
    .eq('id', userId);
  if (error) throw error;
  publish(on);
  if (on) {
    const { data } = await supabase.from('visits').select('id').eq('status', 'needs_consent');
    await Promise.allSettled((data ?? []).map((v) => callFunction('process-visit', { visit_id: v.id })));
  }
}

/** Current AI consent (null until known). Loads it once per app run. */
export function useAiConsent(): boolean | null {
  const [on, setOn] = useState<boolean | null>(current);
  useEffect(() => {
    listeners.add(setOn);
    if (current === null) void loadAiConsent();
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

/** Forget the cached value (on sign-out, so the next account loads its own). */
export function resetAiConsent() {
  current = null;
}
