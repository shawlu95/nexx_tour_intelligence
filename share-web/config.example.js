// Copy to config.js and fill in from Supabase → Project Settings → API.
// The anon (publishable) key is safe to publish: the page can only call get_shared_note.
window.NORA_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'your-anon-or-publishable-key',
};
