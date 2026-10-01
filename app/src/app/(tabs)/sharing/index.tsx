// Sharing tab, recreated from the mockup. UI only for now: invitations are not
// sent or saved (see lib/sharingPreview.ts).
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../components/Avatar';
import { Button, colors, Screen, StatusPill, TabHeader } from '../../../components/ui';
import { displayNameOf, useAuth } from '../../../lib/auth';
import { AGENT_LIMIT, usePreviewAgents } from '../../../lib/sharingPreview';
import { supabase } from '../../../lib/supabase';

export default function Sharing() {
  const { session } = useAuth();
  const agents = usePreviewAgents();
  const [notes, setNotes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ready')
        .then(({ count }) => setNotes(count ?? 0));
    }, []),
  );

  const left = Math.max(0, AGENT_LIMIT - agents.length);
  const name = displayNameOf(session?.user);

  return (
    <Screen tab style={s.screen}>
      <TabHeader />

      <View style={s.hero}>
        <View style={s.lock}>
          <SymbolView name="lock" tintColor={colors.good} size={26} type="monochrome" />
        </View>
        <Text style={s.eyebrow}>PRIVATE WORKSPACE</Text>
        <Text style={s.title} accessibilityRole="header">
          Your home search belongs to you.
        </Text>
        <Text style={s.body}>
          {agents.some((a) => a.status === 'active')
            ? 'You and the agents you invited can see your tour notes and rankings.'
            : `Only you can see your ${notes === null ? '' : `${notes} `}tour ${notes === 1 ? 'note' : 'notes'} and rankings right now.`}
        </Text>
      </View>

      <View style={s.card}>
        <View style={s.inviteIcon}>
          <SymbolView name="person.badge.plus" tintColor={colors.accent} size={20} type="monochrome" />
        </View>
        <Text style={s.cardTitle}>Share with your agent</Text>
        <Text style={s.cardBody}>
          {left > 0
            ? `You can invite ${left} more ${left === 1 ? 'agent' : 'agents'}. Pending invitations count toward the two-agent limit.`
            : "You've invited two agents, the most allowed. Pending invitations count toward the limit."}
        </Text>
        <Button title="Invite an agent" onPress={() => router.push('/sharing/invite')} disabled={left === 0} style={s.cardButton} />
      </View>

      <View style={s.access}>
        <Text style={s.accessTitle}>Who has access</Text>
        <AccessRow name={name} detail="Owner · full control" pill={<StatusPill label="Active" tone="good" />} />
        {agents.map((a) => (
          <AccessRow
            key={a.id}
            name={a.name || a.email}
            detail={a.status === 'active' ? 'Agent · can view and add notes' : 'Invitation sent'}
            pill={a.status === 'active' ? <StatusPill label="Active" tone="good" /> : <StatusPill label="Invitation pending" tone="warn" />}
          />
        ))}
      </View>
    </Screen>
  );
}

function AccessRow({ name, detail, pill }: { name: string; detail: string; pill: React.ReactNode }) {
  return (
    <View style={s.row}>
      <Avatar name={name} size={40} />
      <View style={s.flex}>
        <Text style={s.rowName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={s.rowDetail}>{detail}</Text>
      </View>
      {pill}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { gap: 22 },
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 8 },
  lock: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.goodSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.4, lineHeight: 31 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: 'center', paddingHorizontal: 12 },
  card: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 18,
  },
  inviteIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardBody: { fontSize: 13, lineHeight: 19, color: colors.ink2, textAlign: 'center', paddingHorizontal: 8 },
  cardButton: { alignSelf: 'stretch', marginTop: 8 },
  access: { gap: 10 },
  accessTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
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
  rowName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  rowDetail: { fontSize: 13, color: colors.ink3, marginTop: 1 },
});
