// UI-only preview of agent sharing (the Sharing tab, as designed in the mockup).
// NOTHING IS SENT OR SAVED: invitations live in memory until the app restarts.
// Replace with real invitations (a table + an email through Resend) when the
// agent workspace is built (README §1, "Agent workspace").
import { useSyncExternalStore } from 'react';

export const AGENT_LIMIT = 2;

export interface PreviewAgent {
  id: string;
  name: string;
  email: string;
}

let agents: PreviewAgent[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function inviteAgent(name: string, email: string): PreviewAgent {
  const agent: PreviewAgent = { id: `${Date.now()}`, name: name.trim(), email: email.trim() };
  agents = [...agents, agent];
  emit();
  return agent;
}

/** Cancels a pending invitation or removes an agent's access. */
export function removeAgent(id: string) {
  agents = agents.filter((a) => a.id !== id);
  emit();
}

export function usePreviewAgents(): PreviewAgent[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => agents,
  );
}

/** "Francis Sun" → "FS"; "agent@example.com" → "A". */
export function initials(nameOrEmail: string): string {
  const words = nameOrEmail.split('@')[0].split(/[\s._-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0]?.[0] ?? '?')).toUpperCase();
}

// Deactivation preview (Profile → Deactivate account). Also UI only: nothing
// changes on the server; it pauses the Sharing tab until the app restarts.
let paused = false;

export function setWorkspacePaused(value: boolean) {
  paused = value;
  emit();
}

export function useWorkspacePaused(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => paused,
  );
}

/**
 * The workspace badge: "Paused" after deactivation, "Invite pending" (yellow)
 * while an agent invitation is waiting, otherwise "Private" (green).
 */
export function useWorkspaceStatus(): { label: string; tone: 'good' | 'warn' | 'neutral' } {
  const paused = useWorkspacePaused();
  const pending = usePreviewAgents().length > 0;
  if (paused) return { label: 'Paused', tone: 'neutral' };
  if (pending) return { label: 'Invite pending', tone: 'warn' };
  return { label: 'Private', tone: 'good' };
}
