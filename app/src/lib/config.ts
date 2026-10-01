// Public configuration, read from EXPO_PUBLIC_* variables at build time (see .env.example).

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Copy app/.env.example to app/.env.local and fill it in.`);
  }
  return value.replace(/\/$/, '');
}

export const SUPABASE_URL = required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
export const SHARE_BASE_URL = required('EXPO_PUBLIC_SHARE_BASE_URL', process.env.EXPO_PUBLIC_SHARE_BASE_URL);

/** Recording length guidance, in seconds. */
export const RECORDING = {
  minSeconds: 5,
  goodSeconds: 40,
  targetSeconds: 60,
  maxSeconds: 120,
};
