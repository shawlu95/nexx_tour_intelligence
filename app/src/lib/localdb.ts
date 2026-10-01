// On-phone storage: the upload queue for recordings not yet processed, and a
// small cache so homes and notes the buyer has seen can be read offline.
import * as SQLite from 'expo-sqlite';
import type { AddressDraft } from './address';

const db = SQLite.openDatabaseSync('nora.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS pending_visits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    property_id TEXT,
    property_draft TEXT,
    address_label TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    file_uri TEXT NOT NULL,
    stage TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY NOT NULL,
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

/**
 * Upload stages, in order. Each step is safe to repeat.
 * saved → property (property row exists) → visit (visit row exists) → uploaded (audio in storage) → submitted (processing requested)
 */
export type Stage = 'saved' | 'property' | 'visit' | 'uploaded' | 'submitted';

export interface PendingVisit {
  id: string;
  user_id: string;
  property_id: string | null;
  property_draft: AddressDraft | null;
  address_label: string;
  recorded_at: string;
  duration_seconds: number;
  file_uri: string;
  stage: Stage;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

interface PendingRow extends Omit<PendingVisit, 'property_draft'> {
  property_draft: string | null;
}

function fromRow(r: PendingRow): PendingVisit {
  return { ...r, property_draft: r.property_draft ? (JSON.parse(r.property_draft) as AddressDraft) : null };
}

export async function addPending(v: Omit<PendingVisit, 'stage' | 'attempts' | 'next_attempt_at' | 'last_error'>) {
  await db.runAsync(
    `INSERT INTO pending_visits (id, user_id, property_id, property_draft, address_label, recorded_at, duration_seconds, file_uri, stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'saved')`,
    v.id,
    v.user_id,
    v.property_id,
    v.property_draft ? JSON.stringify(v.property_draft) : null,
    v.address_label,
    v.recorded_at,
    v.duration_seconds,
    v.file_uri,
  );
}

export async function listPending(userId: string): Promise<PendingVisit[]> {
  const rows = await db.getAllAsync<PendingRow>(
    'SELECT * FROM pending_visits WHERE user_id = ? ORDER BY recorded_at DESC',
    userId,
  );
  return rows.map(fromRow);
}

export async function getPending(id: string): Promise<PendingVisit | null> {
  const row = await db.getFirstAsync<PendingRow>('SELECT * FROM pending_visits WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function updatePending(id: string, fields: Partial<Omit<PendingVisit, 'id' | 'property_draft'>>) {
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;
  await db.runAsync(
    `UPDATE pending_visits SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map((k) => fields[k] as SQLite.SQLiteBindValue),
    id,
  );
}

export async function removePending(id: string) {
  await db.runAsync('DELETE FROM pending_visits WHERE id = ?', id);
}

export async function cacheSet(key: string, value: unknown) {
  await db.runAsync(
    'INSERT OR REPLACE INTO cache (key, json, updated_at) VALUES (?, ?, ?)',
    key,
    JSON.stringify(value),
    Date.now(),
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM cache WHERE key = ?', key);
  return row ? (JSON.parse(row.json) as T) : null;
}

/** Wipes everything on sign-out or account deletion. */
export async function clearLocalData() {
  await db.execAsync('DELETE FROM pending_visits; DELETE FROM cache;');
}
