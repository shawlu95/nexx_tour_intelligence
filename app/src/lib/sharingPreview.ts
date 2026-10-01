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
  status: 'pending' | 'active';
}

let agents: PreviewAgent[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function inviteAgent(name: string, email: string): PreviewAgent {
  const agent: PreviewAgent = { id: `${Date.now()}`, name: name.trim(), email: email.trim(), status: 'pending' };
  agents = [...agents, agent];
  emit();
  return agent;
}

export function setAgentStatus(id: string, status: PreviewAgent['status']) {
  agents = agents.map((a) => (a.id === id ? { ...a, status } : a));
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
