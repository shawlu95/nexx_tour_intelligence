import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

// Sessions live in the Keychain / Keystore. SecureStore values are size-limited,
// so long values are split across numbered keys.
const CHUNK = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, parts[i]);
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count !== null) {
      for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
      await SecureStore.deleteItemAsync(`${key}.n`);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Calls an Edge Function and returns a readable error message on failure. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const payload = (await context.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    }
    throw new Error(message);
  }
  return data as T;
}
