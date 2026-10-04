// Invite your agent, recreated from the mockup. UI only: nothing is sent
// (see lib/sharingPreview.ts).
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, colors, Field, fontFamily, Screen, TabHeader } from '../../../components/ui';
import { inviteAgent, useWorkspacePaused } from '../../../lib/sharingPreview';

export default function InviteAgent() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [agreement, setAgreement] = useState(false);
  const paused = useWorkspacePaused();
  const [showAgreementError, setShowAgreementError] = useState(false);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const ready = name.trim().length > 0 && validEmail;

  function send() {
    // A deactivated account can't invite agents.
    if (paused) return router.back();
    if (!agreement) {
      setShowAgreementError(true);
      return;
    }
    const agent = inviteAgent(name, email);
    router.replace({ pathname: '/sharing/sent', params: { id: agent.id, name: agent.name } });
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tab style={s.screen}>
        <TabHeader />

        <Pressable accessibilityRole="link" onPress={() => router.back()} hitSlop={10} style={s.back}>
          <SymbolView name="chevron.left" tintColor={colors.ink2} size={12} type="monochrome" />
          <Text style={s.backText}>Back</Text>
        </Pressable>

        <View style={s.heading}>
          <Text style={s.eyebrow}>OPTIONAL SHARING</Text>
          <Text style={s.title} accessibilityRole="header">
            Invite your agent
          </Text>
          <Text style={s.body}>They can view confirmed property addresses, tour notes, concerns, and rankings. They cannot see your account credentials or raw location.</Text>
        </View>

        <View style={s.form}>
          <Field label="Agent name" value={name} onChangeText={setName} placeholder="Jordan Lee" autoCapitalize="words" autoComplete="name" />
          <Field
            label="Agent email"
            value={email}
            onChangeText={setEmail}
            placeholder="agent@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreement }}
            onPress={() => {
              setAgreement((v) => !v);
              setShowAgreementError(false);
            }}
            style={s.agreement}
          >
            <View style={[s.box, agreement && s.boxOn]}>
              {agreement ? <SymbolView name="checkmark" tintColor="#FFFFFF" size={12} type="monochrome" /> : null}
            </View>
            <Text style={s.agreementText}>We already have a signed representation agreement.</Text>
          </Pressable>
          {showAgreementError ? <Text style={s.error}>Please confirm the representation agreement first.</Text> : null}
        </View>

        <View style={s.footer}>
          <Button title="Send secure invitation" onPress={send} disabled={!ready} />
          <Text style={s.note}>An app connection does not create a representation agreement.</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 20 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: { fontFamily, fontSize: 14, fontWeight: '600', color: colors.ink2 },
  heading: { gap: 8 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  body: { fontFamily, fontSize: 15, lineHeight: 22, color: colors.ink2 },
  form: { gap: 14 },
  agreement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.sunk,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.ink3,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  agreementText: { flex: 1, fontFamily, fontSize: 14, color: colors.ink, lineHeight: 20 },
  error: { fontFamily, fontSize: 13, color: colors.bad, fontWeight: '600' },
  footer: { gap: 12 },
  note: { fontFamily, fontSize: 12, color: colors.ink3, textAlign: 'center' },
});
