// Profile, recreated from the mockup. Sign out and Delete account work;
// Deactivate / Reactivate is UI only for now (nothing changes on the server).
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Banner, Body, Button, colors, Screen, StatusPill, TabHeader } from '../../components/ui';
import { deleteAccount } from '../../lib/api';
import { displayNameOf, signOut, useAuth } from '../../lib/auth';
import { listPending } from '../../lib/localdb';

export default function Profile() {
  const { session } = useAuth();
  const user = session?.user;
  const [unsent, setUnsent] = useState(0);
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null);
  const [paused, setPaused] = useState(false); // UI-only preview of deactivation
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) listPending(user.id).then((p) => setUnsent(p.filter((v) => v.stage !== 'submitted').length));
  }, [user]);

  const name = displayNameOf(user);
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const signInMethod = provider === 'email' ? 'Email code' : provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <Screen tab style={s.screen}>
      <TabHeader />

      <View style={s.account}>
        <Text style={s.eyebrow}>YOUR ACCOUNT</Text>
        <View style={s.identity}>
          <Avatar name={name} size={52} />
          <View style={s.flex}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={s.kind}>Buyer account</Text>
          </View>
          {paused ? <StatusPill label="Paused" tone="neutral" /> : <StatusPill label="Active" tone="good" />}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Account details</Text>
        <Detail label="Email" value={user?.email ?? '—'} />
        <Detail label="Sign-in method" value={signInMethod} />
        <Detail label="Workspace" value={paused ? 'Paused' : 'Private'} last />
      </View>

      <LinkRow icon="person.badge.plus" label="Manage agent access" onPress={() => router.navigate('/sharing')} />
      {confirm === 'signout' ? (
        <View style={s.confirm}>
          <Text style={s.confirmTitle}>Sign out?</Text>
          <Body>
            {unsent > 0
              ? `${unsent} recording${unsent === 1 ? " hasn't" : "s haven't"} uploaded yet and will be lost if you sign out now.`
              : 'Your notes stay saved in your account.'}
          </Body>
          <View style={s.row}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirm(null)} style={s.flex} />
            <Button kind={unsent > 0 ? 'danger' : 'primary'} title="Sign out" onPress={() => signOut()} style={s.flex} />
          </View>
        </View>
      ) : (
        <LinkRow icon="rectangle.portrait.and.arrow.right" label="Sign out" onPress={() => setConfirm('signout')} />
      )}

      <View style={s.status}>
        <Text style={s.cardTitle}>Account status</Text>
        <Text style={s.statusBody}>
          {paused
            ? 'Your workspace is paused and every agent’s access is paused. Reactivate to pick up where you left off.'
            : 'Deactivation pauses your workspace and immediately pauses every agent’s access. You can reactivate later.'}
        </Text>
        {paused ? (
          <Button title="Reactivate account" onPress={() => setPaused(false)} />
        ) : (
          <Button kind="danger" title="Deactivate account" onPress={() => setPaused(true)} />
        )}
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {confirm === 'delete' ? (
        <View style={s.confirm}>
          <Text style={s.confirmTitle}>Delete your account?</Text>
          <Body>{"Every recording, transcript, note and share link is deleted for good. This can't be undone."}</Body>
          <View style={s.row}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirm(null)} style={s.flex} />
            <Button
              kind="danger"
              title="Delete account"
              loading={busy}
              style={s.flex}
              onPress={async () => {
                setBusy(true);
                setError('');
                try {
                  await deleteAccount();
                  await signOut();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't delete your account. Try again.");
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      ) : (
        // Required by the App Store for apps with accounts; kept quiet below the mockup's design.
        <Pressable accessibilityRole="button" onPress={() => setConfirm('delete')} hitSlop={8} style={s.delete}>
          <Text style={s.deleteText}>Delete account and all data</Text>
        </Pressable>
      )}
    </Screen>
  );
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.detail, !last && s.detailDivider]}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
      <SymbolView name={icon} tintColor={colors.accent} size={18} type="monochrome" />
      <Text style={s.linkText}>{label}</Text>
      <SymbolView name="chevron.right" tintColor={colors.ink3} size={12} type="monochrome" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { gap: 14 },
  flex: { flex: 1 },
  account: { gap: 12, marginTop: 6, marginBottom: 4 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  kind: { fontSize: 14, color: colors.ink3, marginTop: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 13 },
  detailDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  detailLabel: { fontSize: 14, color: colors.ink2 },
  detailValue: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.ink, textAlign: 'right' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  linkText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  confirm: { gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 10 },
  status: {
    gap: 10,
    backgroundColor: '#FDF4F4',
    borderWidth: 1,
    borderColor: '#F1D5D5',
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
  statusBody: { fontSize: 13, lineHeight: 19, color: colors.ink2 },
  delete: { alignSelf: 'center', paddingVertical: 8 },
  deleteText: { fontSize: 13, color: colors.ink3, fontWeight: '600' },
});
