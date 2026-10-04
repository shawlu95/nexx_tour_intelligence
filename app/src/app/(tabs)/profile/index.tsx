// Profile, recreated from the mockup. Sign out works, and Privacy & data holds
// permanent account deletion. Deactivate / Reactivate is UI only for now
// (nothing changes on the server).
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSheet } from '../../../components/DesignSheet';
import { Avatar } from '../../../components/Avatar';
import { tapWarning } from '../../../lib/haptics';
import { Button, colors, fontFamily, Screen, StatusPill, TabHeader } from '../../../components/ui';
import { displayNameOf, signOut, useAuth } from '../../../lib/auth';
import { listPending } from '../../../lib/localdb';
import { setWorkspacePaused, useWorkspacePaused, useWorkspaceStatus } from '../../../lib/sharingPreview';

export default function Profile() {
  const { session } = useAuth();
  const user = session?.user;
  const [unsent, setUnsent] = useState(0);
  const paused = useWorkspacePaused(); // UI-only preview of deactivation
  const workspace = useWorkspaceStatus();
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (user) listPending(user.id).then((p) => setUnsent(p.filter((v) => v.stage !== 'submitted').length));
  }, [user]);

  const [asking, setAsking] = useState<'signout' | 'deactivate' | null>(null);

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
          {paused ? <StatusPill label="Deactivated" tone="bad" /> : <StatusPill label="Active" tone="good" />}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Account details</Text>
        <Detail label="Email" value={user?.email ?? '—'} />
        <Detail label="Sign-in method" value={signInMethod} />
        <Detail label="Workspace" value={workspace.label} last />
      </View>

      <LinkRow icon="checkmark.shield" label="Privacy & data" onPress={() => router.push('/profile/privacy')} />
      <LinkRow icon="rectangle.portrait.and.arrow.right" label="Sign out" onPress={() => setAsking('signout')} />

      <View style={s.status}>
        <Text style={s.cardTitle}>Account status</Text>
        <Text style={s.statusBody}>
          {paused
            ? 'Your workspace is paused and every agent’s access is paused. Reactivate to pick up where you left off.'
            : 'Deactivation pauses your workspace and agent access. Your account data is kept so you can reactivate later. To delete everything instead, use Privacy & data.'}
        </Text>
        {paused ? (
          <Button
            kind="success"
            title="Reactivate account"
            onPress={() => {
              setWorkspacePaused(false);
              setToast('Account reactivated');
            }}
          />
        ) : (
          <Button kind="danger" title="Deactivate account" onPress={() => setAsking('deactivate')} />
        )}
      </View>

      <DesignSheet
        visible={asking === 'signout'}
        tone={unsent > 0 ? 'danger' : 'primary'}
        icon="rectangle.portrait.and.arrow.right"
        title="Sign out?"
        copy={
          unsent > 0
            ? `${unsent} recording${unsent === 1 ? " hasn't" : "s haven't"} uploaded yet and will be lost if you sign out now.`
            : 'Your notes stay saved in your account.'
        }
        primaryLabel="Sign out"
        onPrimary={() => {
          setAsking(null);
          void signOut();
        }}
        secondaryLabel="Cancel"
        onSecondary={() => setAsking(null)}
      />
      <DesignSheet
        visible={asking === 'deactivate'}
        tone="danger"
        iconText="!"
        title="Deactivate your account?"
        copy="Your workspace and agent access will pause. Your notes and account data are kept so you can reactivate later."
        primaryLabel="Deactivate account"
        onPrimary={() => {
          setAsking(null);
          tapWarning();
          setWorkspacePaused(true);
          setToast('Account deactivated · agent access paused');
        }}
        secondaryLabel="Keep account active"
        onSecondary={() => setAsking(null)}
      />
      {toast ? (
        <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
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
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontFamily, fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  kind: { fontFamily, fontSize: 15, color: colors.ink3, marginTop: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cardTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 13 },
  detailDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  detailLabel: { fontFamily, fontSize: 15, color: colors.ink2 },
  detailValue: { flexShrink: 1, fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'right' },
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
  linkText: { flex: 1, fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  status: {
    gap: 10,
    backgroundColor: '#FDF4F4',
    borderWidth: 1,
    borderColor: '#F1D5D5',
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
  statusBody: { fontFamily, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  toast: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastText: { fontFamily, fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
