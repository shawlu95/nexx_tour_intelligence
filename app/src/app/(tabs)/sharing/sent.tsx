// Invitation sent, recreated from the mockup. UI only: nothing was actually sent
// (see lib/sharingPreview.ts).
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../components/Avatar';
import { Button, colors, fontFamily, Screen, StatusPill } from '../../../components/ui';
import { setAgentStatus, usePreviewAgents } from '../../../lib/sharingPreview';

export default function InvitationSent() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const agent = usePreviewAgents().find((a) => a.id === id);
  const agentName = agent?.name || name || 'Your agent';
  const accepted = agent?.status === 'active';
  const firstName = agentName.split(/\s+/)[0];

  return (
    <Screen header style={s.screen}>

      <View style={s.hero}>
        <View style={s.check}>
          <SymbolView name="checkmark" tintColor={colors.good} size={28} type="monochrome" />
        </View>
        <Text style={s.eyebrow}>{accepted ? 'INVITATION ACCEPTED' : 'INVITATION SENT'}</Text>
        <Text style={s.title} accessibilityRole="header">
          You stay in control.
        </Text>
        <Text style={s.body}>
          {accepted
            ? `${firstName} can now view your tours and add notes. You can remove access at any time.`
            : `${firstName} will receive a secure link. Access begins only after the invitation is accepted.`}
        </Text>
      </View>

      <View style={s.row}>
        <Avatar name={agentName} size={40} />
        <View style={s.flex}>
          <Text style={s.rowName} numberOfLines={1}>
            {agentName}
          </Text>
          <Text style={s.rowDetail}>{accepted ? 'Access active' : 'Invitation sent'}</Text>
        </View>
        {accepted ? <StatusPill label="Active" tone="good" /> : <StatusPill label="Invitation pending" tone="warn" />}
      </View>

      <View style={s.actions}>
        {!accepted && agent ? <Button title="Preview accepted status" onPress={() => setAgentStatus(agent.id, 'active')} /> : null}
        <Pressable accessibilityRole="link" onPress={() => router.dismissTo('/sharing')} hitSlop={10} style={s.manage}>
          <Text style={s.manageText}>Manage sharing</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: { gap: 22 },
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 36 },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goodSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  body: { fontFamily, fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: 'center', paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
  },
  rowName: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  rowDetail: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 1 },
  actions: { gap: 14 },
  manage: { alignSelf: 'center' },
  manageText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.accent },
});
