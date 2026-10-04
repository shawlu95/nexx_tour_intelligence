// Sign-in, from the mockup's launch page: "Remember every home." revealed word by
// word, a blue line drawn under it, then Continue with Google / Apple / email
// rising in. Email continues with the address and code steps in the same style.
import * as AppleAuthentication from 'expo-apple-authentication';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendEmailCode, signInWithApple, signInWithGoogle, verifyEmailCode } from '../lib/auth';
import { FREE_SIGNING } from '../lib/config';
import { LegalModal, type LegalDocName } from './Legal';
import { brandFont, easeOut, OnboardingScreen, RiseIn } from './Onboarding';
import { Banner, colors, fontFamily } from './ui';

type Step = 'choose' | 'email' | 'code';

function messageFor(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'ERR_REQUEST_CANCELED') return '';
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

const WORDS = ['Remember', 'every', 'home.'];
const WORD_DELAYS = [120, 280, 440];

export default function SignIn() {
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [legal, setLegal] = useState<LegalDocName | null>(null);

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

  async function apple() {
    // Sign in with Apple needs the paid Apple Developer Program; free-signing builds can't use it.
    const available = !FREE_SIGNING && (await AppleAuthentication.isAvailableAsync().catch(() => false));
    if (!available) return setError('Sign in with Apple isn’t available in this test build. Continue with email instead.');
    await run('apple', signInWithApple);
  }

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <OnboardingScreen>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'choose' ? (
          <>
            <View style={s.landing}>
              <View style={s.intro} accessible accessibilityRole="header" accessibilityLabel="Remember every home.">
                <View style={s.sloganRow}>
                  {WORDS.map((w, i) => (
                    <Word key={w} word={w} delay={WORD_DELAYS[i]} />
                  ))}
                </View>
                <Underline />
              </View>

              {error ? <Banner tone="error">{error}</Banner> : null}

              <View style={s.actions}>
                <RiseIn delay={720}>
                  <Provider
                    mark={<Text style={s.googleMark}>G</Text>}
                    label="Continue with Google"
                    busy={busy === 'google'}
                    onPress={() => run('google', signInWithGoogle)}
                  />
                </RiseIn>
                <RiseIn delay={820}>
                  <Provider
                    mark={<SymbolView name="apple.logo" tintColor="rgb(17,28,49)" size={17} type="monochrome" />}
                    label="Continue with Apple"
                    busy={busy === 'apple'}
                    onPress={() => void apple()}
                  />
                </RiseIn>
                <RiseIn delay={920}>
                  <Provider
                    email
                    mark={
                      <View style={s.emailMark}>
                        <Text style={s.emailMarkText}>@</Text>
                      </View>
                    }
                    label="Continue with email"
                    onPress={() => {
                      setError('');
                      setStep('email');
                    }}
                  />
                </RiseIn>
              </View>
            </View>

            <Text style={s.terms}>
              By continuing, you agree to the{' '}
              <Text style={s.termsLink} accessibilityRole="link" onPress={() => setLegal('terms')}>
                Terms
              </Text>{' '}
              and acknowledge the{' '}
              <Text style={s.termsLink} accessibilityRole="link" onPress={() => setLegal('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </>
        ) : (
          <RiseIn delay={0} distance={0} duration={300} style={s.flow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError('');
                setStep(step === 'code' ? 'email' : 'choose');
              }}
              hitSlop={10}
              style={s.back}
            >
              <SymbolView name="chevron.left" tintColor={colors.ink2} size={13} type="monochrome" weight="semibold" />
              <Text style={s.backText}>Back</Text>
            </Pressable>

            <View style={s.flowCopy}>
              <Text style={s.stepCount}>{step === 'email' ? '1 of 2' : '2 of 2'}</Text>
              <Text style={s.kicker}>{step === 'email' ? 'SIGN IN OR CREATE AN ACCOUNT' : 'VERIFY YOUR EMAIL'}</Text>
              <Text style={s.flowTitle} accessibilityRole="header">
                {step === 'email' ? 'What’s your email?' : 'Check your inbox.'}
              </Text>
              <Text style={s.flowBody}>
                {step === 'email' ? 'We’ll send a sign-in code. No password needed.' : `Enter the code sent to ${email.trim()}.`}
              </Text>
            </View>

            {error ? <Banner tone="error">{error}</Banner> : null}

            {step === 'email' ? (
              <>
                <Text style={s.fieldLabel}>Email address</Text>
                <TextInput
                  accessibilityLabel="Email address"
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="you@example.com"
                  placeholderTextColor="#8C95A6"
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={() => validEmail && void run('send', async () => {
                    await sendEmailCode(email);
                    setStep('code');
                  })}
                />
                <PrimaryButton
                  title="Send verification code"
                  disabled={!validEmail}
                  busy={busy === 'send'}
                  onPress={() =>
                    run('send', async () => {
                      await sendEmailCode(email);
                      setStep('code');
                    })
                  }
                />
              </>
            ) : (
              <>
                <Text style={s.fieldLabel}>Verification code</Text>
                <TextInput
                  accessibilityLabel="Verification code"
                  style={[s.input, s.codeInput]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="Code from the email"
                  placeholderTextColor="#8C95A6"
                  autoFocus
                />
                <PrimaryButton
                  title="Verify email"
                  disabled={code.length < 6}
                  busy={busy === 'verify'}
                  onPress={() => run('verify', () => verifyEmailCode(email, code))}
                />
                <Pressable accessibilityRole="button" onPress={() => run('send', () => sendEmailCode(email))} hitSlop={8} style={s.resend}>
                  <Text style={s.resendText}>Send a new code</Text>
                </Pressable>
              </>
            )}
          </RiseIn>
        )}
      </KeyboardAvoidingView>
      <LegalModal doc={legal} onClose={() => setLegal(null)} />
    </OnboardingScreen>
  );
}

/** One word of the slogan, rising 22 pt into place (slogan-reveal). */
function Word({ word, delay }: { word: string; delay: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 720, delay, easing: easeOut, useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.Text
      style={[s.slogan, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}
    >
      {word}
    </Animated.Text>
  );
}

/** The blue line under the slogan, drawn from the centre out (slogan-line). */
function Underline() {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 620, delay: 820, easing: easeOut, useNativeDriver: true }).start();
  }, [t]);
  return <Animated.View style={[s.underline, { opacity: t, transform: [{ scaleX: t }] }]} />;
}

function Provider({
  mark,
  label,
  onPress,
  busy,
  email,
}: {
  mark: React.ReactNode;
  label: string;
  onPress: () => void;
  busy?: boolean;
  email?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [s.provider, email && s.providerEmail, pressed && { transform: [{ scale: 0.99 }] }, busy && { opacity: 0.7 }]}
    >
      <View style={s.mark}>{mark}</View>
      <Text style={[s.providerText, email && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ title, onPress, disabled, busy }: { title: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.primary, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <Text style={s.primaryText}>{busy ? 'Please wait…' : title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  landing: { flex: 1, justifyContent: 'center', transform: [{ translateY: 10 }] },
  intro: { alignItems: 'center', marginBottom: 80 },
  sloganRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 330 },
  slogan: {
    paddingHorizontal: 5,
    fontFamily: brandFont,
    fontSize: 34.5,
    lineHeight: 36,
    letterSpacing: -2,
    color: colors.ink,
  },
  underline: { width: 34, height: 4, borderRadius: 4, backgroundColor: colors.accent, marginTop: 20 },
  actions: { gap: 11 },
  provider: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgb(220,227,237)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: 'rgb(17,28,49)',
    shadowOpacity: 0.055,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 9 },
  },
  providerEmail: {
    borderColor: 'rgb(197,226,255)',
    shadowOpacity: 0,
    experimental_backgroundImage: 'linear-gradient(135deg, rgba(33,150,255,0.07), rgba(76,185,255,0.13))',
    backgroundColor: 'transparent',
  },
  providerText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  mark: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  googleMark: { fontFamily, fontSize: 13, fontWeight: '800', color: 'rgb(55,125,255)' },
  emailMark: { width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgb(206,232,255)', alignItems: 'center', justifyContent: 'center' },
  emailMarkText: { fontFamily, fontSize: 13, fontWeight: '800', color: colors.accent },
  terms: { fontFamily, fontSize: 12, lineHeight: 17, color: 'rgb(124,135,152)', textAlign: 'center', maxWidth: 305, alignSelf: 'center' },
  termsLink: { color: colors.accent, textDecorationLine: 'underline' },
  // Email and code steps
  flow: { flex: 1, paddingTop: 20, gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  backText: { fontFamily, fontSize: 15, fontWeight: '600', color: colors.ink2 },
  flowCopy: { gap: 8, marginTop: 8, marginBottom: 8 },
  stepCount: { fontFamily, fontSize: 12, color: colors.ink3 },
  kicker: { fontFamily, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: colors.accent },
  flowTitle: { fontFamily: brandFont, fontSize: 30.5, lineHeight: 33, letterSpacing: -1.4, color: colors.ink },
  flowBody: { fontFamily, fontSize: 15, lineHeight: 23, color: 'rgb(104,117,138)' },
  fieldLabel: { fontFamily, fontSize: 13, fontWeight: '700', color: colors.ink2, marginTop: 4 },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgb(220,227,237)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontFamily,
    fontSize: 17,
    color: colors.ink,
  },
  codeInput: { fontSize: 22, letterSpacing: 6, fontVariant: ['tabular-nums'] },
  primary: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: 'rgb(33,150,255)',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 9 },
  },
  primaryText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.accentDark },
  resend: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  resendText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent },
});
