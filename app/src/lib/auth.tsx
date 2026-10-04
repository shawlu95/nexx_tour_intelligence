import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { resetAiConsent } from './consent';
import { clearLocalData } from './localdb';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The signed-in user's id. Only use inside screens shown after sign-in. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId called while signed out');
  return session.user.id;
}

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw error;
}

export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token.');
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

/** Google sign-in through Supabase's hosted OAuth page (PKCE). Returns false if the buyer cancelled. */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Google sign-in did not complete. Try again.');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

export async function signOut() {
  await clearLocalData();
  resetAiConsent();
  await supabase.auth.signOut();
}

/** The name to show for the signed-in buyer: their full name, else a tidy version of their email. */
export function displayNameOf(user: Session['user'] | null | undefined): string {
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const name = (meta.full_name ?? meta.name ?? '').trim();
  if (name) return name;
  const local = (user?.email ?? '').split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'You';
}
