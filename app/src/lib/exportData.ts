// "Download my data" (Profile → Privacy & data): everything stored for the
// signed-in buyer, as one JSON file the buyer saves or sends from the share sheet.
// Row-level security limits each query to the buyer's own rows.
import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';
import { supabase } from './supabase';

const TABLES = [
  'profiles',
  'properties',
  'visits',
  'transcripts',
  'notes',
  'note_items',
  'share_links',
  'ranking_messages',
  'buyer_priorities',
  'ranking_overrides',
] as const;

/** Builds the export and opens the share sheet. Resolves once the sheet closes. */
export async function exportMyData(): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) throw new Error('Sign in again to continue.');

  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw new Error(`Couldn't read your ${table.replace('_', ' ')}. Check your connection.`);
    tables[table] = data ?? [];
  }

  const exported = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, sign_in_method: user.app_metadata?.provider ?? 'email', created_at: user.created_at },
    note: 'Original audio is deleted after transcription, so it is not included.',
    ...tables,
  };

  const file = new File(Paths.cache, `nora-data-${new Date().toISOString().slice(0, 10)}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(exported, null, 2));
  try {
    await Share.share({ url: file.uri, title: 'Your NORA data' });
  } finally {
    // The share sheet has copied or sent it by now; don't leave a copy in the cache.
    if (file.exists) file.delete();
  }
}
