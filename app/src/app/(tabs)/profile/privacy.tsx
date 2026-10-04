// Privacy & data, from the mockup: device permissions, your data (agent access,
// delete account), and the Privacy Policy and Terms.
import { getRecordingPermissionsAsync } from 'expo-audio';
import { getForegroundPermissionsAsync } from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AI_CONSENT_COPY } from '../../../components/AiConsentSheet';
import { WarningSheet } from '../../../components/WarningSheet';
import { colors, fontFamily, Screen } from '../../../components/ui';
import { deleteAccount } from '../../../lib/api';
import { signOut, useUserId } from '../../../lib/auth';
import { setAiConsent, useAiConsent } from '../../../lib/consent';
import { exportMyData } from '../../../lib/exportData';
import { listPending } from '../../../lib/localdb';

type PermissionState = 'granted' | 'denied' | 'undetermined';

const PERMISSION_LABEL: Record<PermissionState, string> = { granted: 'On', denied: 'Off', undetermined: 'Not asked yet' };

export default function PrivacyAndData() {
  const userId = useUserId();
  const [location, setLocation] = useState<PermissionState | null>(null);
  const [microphone, setMicrophone] = useState<PermissionState | null>(null);
  const [unsent, setUnsent] = useState(0);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const aiConsent = useAiConsent();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const refresh = useCallback(() => {
    getForegroundPermissionsAsync()
      .then((p) => setLocation(p.status as PermissionState))
      .catch(() => setLocation(null));
    getRecordingPermissionsAsync()
      .then((p) => setMicrophone(p.status as PermissionState))
      .catch(() => setMicrophone(null));
    listPending(userId).then((p) => setUnsent(p.filter((v) => v.stage !== 'submitted').length));
  }, [userId]);

  useFocusEffect(refresh);
  // Coming back from the Settings app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return (
    <Screen header style={s.screen}>

      <View style={s.heading}>
        <Text style={s.eyebrow}>PRIVACY & DATA</Text>
        <Text style={s.title} accessibilityRole="header">
          You control what NORA uses.
        </Text>
        <Text style={s.lede}>Location finds the home, your note creates the summary, and agents see nothing until you share.</Text>
      </View>

      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Device permissions</Text>
          <Text style={s.cardMeta}>On your iPhone</Text>
        </View>
        <PermissionRow
          title="Location"
          copy="Used only while finding a nearby address. Raw GPS is not saved. You can always type the address instead."
          state={location}
        />
        <PermissionRow
          title="Microphone"
          copy="Turns on only while you record a tour reaction. You can type your note instead."
          state={microphone}
          last
        />
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <View style={s.flex}>
            <Text style={s.rowTitle}>AI note processing</Text>
            <Text style={s.rowCopy}>{AI_CONSENT_COPY}</Text>
          </View>
          <Switch
            accessibilityLabel="Allow AI note processing"
            value={aiConsent === true}
            disabled={aiConsent === null || aiBusy}
            trackColor={{ true: colors.accent }}
            onValueChange={async (on) => {
              setAiBusy(true);
              setAiError('');
              try {
                await setAiConsent(on);
              } catch {
                setAiError("Couldn't change this. Check your connection.");
              }
              setAiBusy(false);
            }}
          />
        </View>
        <Text style={s.aiNote}>
          {aiConsent === false
            ? 'Off: new notes are saved but not organized, and ranking is paused, until you turn this on.'
            : 'Your transcript, summary and ranking stay in your account until you delete them.'}
        </Text>
        {aiError ? <Text style={s.aiError}>{aiError}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Your data</Text>
        <DataRow
          title={exporting ? 'Preparing your data…' : 'Download my data'}
          copy={exportError || 'Export your profile, notes, transcripts and rankings as a file.'}
          onPress={async () => {
            if (exporting) return;
            setExporting(true);
            setExportError('');
            try {
              await exportMyData();
            } catch (e) {
              setExportError(e instanceof Error ? e.message : "Couldn't export your data. Try again.");
            }
            setExporting(false);
          }}
        />
        <DataRow
          title="Manage agent access"
          copy="Review or remove people who can see your activity."
          onPress={() => router.navigate('/sharing')}
        />
        <DataRow
          title="Delete account and data"
          copy="Permanently remove your account, notes and rankings, and turn off every share link."
          danger
          last
          onPress={() => setAsking(true)}
        />
      </View>

      <View style={s.legalLinks}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/profile/privacy-policy')} hitSlop={8}>
          <Text style={s.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/profile/terms')} hitSlop={8}>
          <Text style={s.legalLink}>Terms</Text>
        </Pressable>
      </View>
      <Text style={s.footer}>NORA is designed without advertising or cross-app tracking.</Text>

      <WarningSheet
        visible={asking}
        title="Delete your account and data?"
        copy={`This permanently deletes your profile, tour notes, transcripts, summaries and rankings, and turns off every share link.${
          unsent > 0 ? ` ${unsent} recording${unsent === 1 ? " that hasn't" : "s that haven't"} uploaded yet will be lost too.` : ''
        } This cannot be undone.`}
        confirmLabel="Delete account and data"
        cancelLabel="Cancel"
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
          setAsking(false);
          setDeleteError('');
        }}
      />
    </Screen>
  );
}

function PermissionRow({ title, copy, state, last }: { title: string; copy: string; state: PermissionState | null; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.divider]}>
      <View style={s.flex}>
        <Text style={s.rowTitle}>
          {title}
          {state ? <Text style={s.rowState}>{`  ·  ${PERMISSION_LABEL[state]}`}</Text> : null}
        </Text>
        <Text style={s.rowCopy}>{copy}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} settings`}
        onPress={() => Linking.openSettings()}
        style={({ pressed }) => [s.settings, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.settingsText}>Settings</Text>
      </Pressable>
    </View>
  );
}

function DataRow({
  title,
  copy,
  onPress,
  danger,
  last,
}: {
  title: string;
  copy: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.row, !last && s.divider, pressed && { opacity: 0.7 }]}
    >
      <View style={s.flex}>
        <Text style={[s.rowTitle, danger && { color: colors.bad }]}>{title}</Text>
        <Text style={s.rowCopy}>{copy}</Text>
      </View>
      <SymbolView name="chevron.right" tintColor={colors.ink3} size={12} type="monochrome" />
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { gap: 14 },
  flex: { flex: 1 },
  heading: { gap: 8, marginTop: 4 },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  lede: { fontFamily, fontSize: 15, lineHeight: 20, color: colors.ink2 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  cardMeta: { fontFamily, fontSize: 12, color: colors.ink3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  rowState: { fontFamily, fontSize: 13, fontWeight: '600', color: colors.ink3 },
  rowCopy: { fontFamily, fontSize: 13, lineHeight: 18, color: colors.ink2, marginTop: 3 },
  aiNote: {
    fontFamily, fontSize: 12,
    lineHeight: 17,
    color: colors.ink3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingVertical: 12,
  },
  aiError: { fontFamily, fontSize: 13, color: colors.bad, paddingBottom: 12 },
  settings: { backgroundColor: colors.accentSoft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  settingsText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 4 },
  legalLink: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent, textDecorationLine: 'underline' },
  footer: { fontFamily, fontSize: 12, color: colors.ink3, textAlign: 'center' },
});
