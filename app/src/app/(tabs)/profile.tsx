// Profile, recreated from the mockup. Sign out and Delete account work;
// Deactivate / Reactivate is UI only for now (nothing changes on the server).
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Body, Button, colors, Screen, StatusPill, TabHeader } from '../../components/ui';
import { deleteAccount } from '../../lib/api';
import { displayNameOf, signOut, useAuth } from '../../lib/auth';
import { listPending } from '../../lib/localdb';
import { setWorkspacePaused, useWorkspacePaused } from '../../lib/sharingPreview';

export default function Profile() {
  const { session } = useAuth();
  const user = session?.user;
  const [unsent, setUnsent] = useState(0);
  const [confirm, setConfirm] = useState<'signout' | null>(null);
  const paused = useWorkspacePaused(); // UI-only preview of deactivation
  const [asking, setAsking] = useState<'deactivate' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
          {paused ? <StatusPill label="Deactivated" tone="bad" /> : <StatusPill label="Active" tone="good" />}
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
          <Button
            title="Reactivate account"
            onPress={() => {
              setWorkspacePaused(false);
              setToast('Account reactivated');
            }}
            style={s.reactivate}
          />
        ) : (
          <Button kind="danger" title="Deactivate account" onPress={() => setAsking('deactivate')} />
        )}
      </View>

      {/* Required by the App Store for apps with accounts; kept quiet below the mockup's design. */}
      <Pressable accessibilityRole="button" onPress={() => setAsking('delete')} hitSlop={8} style={s.delete}>
        <Text style={s.deleteText}>Delete account and all data</Text>
      </Pressable>

      <WarningSheet
        visible={asking === 'deactivate'}
        title="Deactivate your account?"
        copy="Your workspace will be paused and every agent will immediately lose access until you reactivate."
        confirmLabel="Deactivate account"
        cancelLabel="Keep account active"
        onConfirm={() => {
          setAsking(null);
          setWorkspacePaused(true);
          setToast('Account deactivated · agent access paused');
        }}
        onCancel={() => setAsking(null)}
      />
      <WarningSheet
        visible={asking === 'delete'}
        title="Delete your account?"
        copy={`Every recording, transcript, note and ranking is deleted for good, and share links stop working.${
          unsent > 0 ? ` ${unsent} recording${unsent === 1 ? " that hasn't" : "s that haven't"} uploaded yet will be lost too.` : ''
        } This can't be undone.`}
        confirmLabel="Delete account"
        cancelLabel="Keep my account"
        busy={deleting}
        error={deleteError}
        onConfirm={async () => {
          setDeleting(true);
          setDeleteError('');
          try {
            await deleteAccount();
            await signOut();
          } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Couldn't delete your account. Try again.");
            setDeleting(false);
          }
        }}
        onCancel={() => {
          setAsking(null);
          setDeleteError('');
        }}
      />
      {toast ? (
        <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

/** Warning bottom sheet, as in the mockup's deactivation dialog. */
function WarningSheet({
  visible,
  title,
  copy,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  copy: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.sheetIcon}>
            <Text style={s.sheetIconText}>!</Text>
          </View>
          <Text style={s.sheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={s.sheetCopy}>{copy}</Text>
          {error ? <Text style={s.sheetError}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [s.sheetDanger, (pressed || busy) && { opacity: 0.85 }]}
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.sheetDangerText}>{confirmLabel}</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.sheetSecondary, pressed && { opacity: 0.7 }]}
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={s.sheetSecondaryText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  reactivate: { backgroundColor: colors.good },
  delete: { alignSelf: 'center', paddingVertical: 8 },
  deleteText: { fontSize: 13, color: colors.ink3, fontWeight: '600' },
  sheetError: { fontSize: 13, color: colors.bad, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,24,0.55)', justifyContent: 'flex-end' },
  sheet: {
    margin: 12,
    marginBottom: 28,
    backgroundColor: colors.surface,
    borderRadius: 26,
    padding: 20,
    paddingTop: 24,
    gap: 12,
    alignItems: 'center',
  },
  sheetIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.badSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sheetIconText: { fontSize: 18, fontWeight: '800', color: colors.bad },
  sheetTitle: { fontSize: 21, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  sheetCopy: { fontSize: 14, lineHeight: 20, color: colors.ink2, textAlign: 'center', paddingHorizontal: 12, marginBottom: 4 },
  sheetDanger: { alignSelf: 'stretch', backgroundColor: colors.bad, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  sheetDangerText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  sheetSecondary: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sheetSecondaryText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  toast: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  toastText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
