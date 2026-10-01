import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, Card, colors, Eyebrow, Screen } from '../components/ui';
import { deleteAccount } from '../lib/api';
import { signOut, useAuth } from '../lib/auth';
import { listPending } from '../lib/localdb';

export default function Settings() {
  const { session } = useAuth();
  const user = session?.user;
  const [unsent, setUnsent] = useState(0);
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) listPending(user.id).then((p) => setUnsent(p.filter((v) => v.stage !== 'submitted').length));
  }, [user]);

  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';

  return (
    <Screen>
      <Card>
        <Eyebrow>Account</Eyebrow>
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Signed in with" value={provider.charAt(0).toUpperCase() + provider.slice(1)} />
      </Card>

      <Body muted>Your notes are private. Agents only see a note when you send them a link, and you can turn links off at any time.</Body>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {confirm === 'signout' ? (
        <Card>
          <Text style={s.cardTitle}>Sign out?</Text>
          <Body>
            {unsent > 0
              ? `${unsent} recording${unsent === 1 ? " hasn't" : "s haven't"} uploaded yet and will be lost if you sign out now.`
              : 'Your notes stay saved in your account.'}
          </Body>
          <View style={s.row}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
            <Button kind={unsent > 0 ? 'danger' : 'primary'} title="Sign out" onPress={() => signOut()} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : confirm === 'delete' ? (
        <Card>
          <Text style={s.cardTitle}>Delete your account?</Text>
          <Body>{"Every recording, transcript, note and share link is deleted for good. This can't be undone."}</Body>
          <View style={s.row}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
            <Button
              kind="danger"
              title="Delete account"
              loading={busy}
              style={{ flex: 1 }}
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
        </Card>
      ) : (
        <View style={s.stack}>
          <Button kind="secondary" title="Sign out" onPress={() => setConfirm('signout')} />
          <Button kind="ghost" title="Delete account" onPress={() => setConfirm('delete')} />
        </View>
      )}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kv}>
      <Text style={s.k}>{label}</Text>
      <Text style={s.v}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  k: { fontSize: 15, color: colors.ink3 },
  v: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stack: { gap: 10 },
});
