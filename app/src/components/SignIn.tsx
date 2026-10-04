import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendEmailCode, signInWithApple, signInWithGoogle, verifyEmailCode } from '../lib/auth';
import { FREE_SIGNING } from '../lib/config';
import { LegalDoc, type LegalDocName } from './Legal';
import { Banner, Body, Button, colors, Field, Screen, Title } from './ui';

type Step = 'choose' | 'email' | 'code';

function messageFor(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'ERR_REQUEST_CANCELED') return '';
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

export default function SignIn() {
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [legal, setLegal] = useState<LegalDocName | null>(null);

  useEffect(() => {
    if (FREE_SIGNING) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  }

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={s.screen}>
        <View style={s.hero}>
          <Text style={s.logo}>NORA</Text>
          <Title style={s.headline}>Remember every home.</Title>
          <Body>Record a one-minute reaction after each open house. NORA turns it into a note you can find later and send to your agent.</Body>
        </View>

        {error ? <Banner tone="error">{error}</Banner> : null}

        {step === 'choose' && (
          <View style={s.stack}>
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={s.apple}
                onPress={() => run('apple', signInWithApple)}
              />
            )}
            <Button kind="secondary" title="Continue with Google" loading={busy === 'google'} onPress={() => run('google', signInWithGoogle)} />
            <Button kind="secondary" title="Continue with email" onPress={() => setStep('email')} />
          </View>
        )}

        {step === 'email' && (
          <View style={s.stack}>
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              autoFocus
            />
            <Button
              title="Send code"
              disabled={!validEmail}
              loading={busy === 'send'}
              onPress={() => run('send', async () => {
                await sendEmailCode(email);
                setStep('code');
              })}
            />
            <Button kind="ghost" title="Back" onPress={() => setStep('choose')} />
          </View>
        )}

        {step === 'code' && (
          <View style={s.stack}>
            <Body>We sent a sign-in code to {email.trim()}.</Body>
            <Field
              label="Code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="Code from the email"
              autoFocus
            />
            <Button
              title="Sign in"
              disabled={code.length < 6}
              loading={busy === 'verify'}
              onPress={() => run('verify', () => verifyEmailCode(email, code))}
            />
            <Button kind="ghost" title="Send a new code" onPress={() => run('send', () => sendEmailCode(email))} />
          </View>
        )}

        <Text style={s.legal}>
          By continuing, you agree to the{' '}
          <Text style={s.legalLink} accessibilityRole="link" onPress={() => setLegal('terms')}>
            Terms
          </Text>{' '}
          and acknowledge the{' '}
          <Text style={s.legalLink} accessibilityRole="link" onPress={() => setLegal('privacy')}>
            Privacy Policy
          </Text>
          . No agent can see your notes until you choose to share them.
        </Text>
      </Screen>
      <Modal visible={legal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLegal(null)}>
        <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
          <View style={s.modalBar}>
            <Pressable accessibilityRole="button" onPress={() => setLegal(null)} hitSlop={10}>
              <Text style={s.done}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>{legal ? <LegalDoc doc={legal} /> : null}</ScrollView>
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { justifyContent: 'center', paddingTop: 60 },
  hero: { gap: 10, marginBottom: 12 },
  logo: { fontSize: 15, fontWeight: '800', letterSpacing: 4, color: colors.ink },
  headline: { fontSize: 32 },
  stack: { gap: 10 },
  apple: { height: 50, width: '100%' },
  legal: { fontSize: 13, lineHeight: 19, color: colors.ink3, textAlign: 'center', marginTop: 12 },
  legalLink: { color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 12 },
  done: { fontSize: 17, fontWeight: '600', color: colors.accent },
  modalBody: { padding: 20, paddingTop: 4 },
});
