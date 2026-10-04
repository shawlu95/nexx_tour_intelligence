// Sharing tab, recreated from the mockup. UI only for now: invitations are not
// sent or saved (see lib/sharingPreview.ts).
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../components/Avatar';
import { Banner, Button, colors, fontFamily, Screen, StatusPill, TabHeader } from '../../../components/ui';
import { displayNameOf, useAuth } from '../../../lib/auth';
import { AGENT_LIMIT, removeAgent, usePreviewAgents, useWorkspacePaused } from '../../../lib/sharingPreview';
import { supabase } from '../../../lib/supabase';

export default function Sharing() {
  const { session } = useAuth();
  const agents = usePreviewAgents();
  const paused = useWorkspacePaused();
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
          {paused
            ? 'Your workspace and every agent connection are paused.'
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
        <Button
          title={paused ? 'Reactivate to invite' : 'Invite an agent'}
          onPress={() => router.push('/sharing/invite')}
          disabled={paused || left === 0}
          style={s.cardButton}
        />
      </View>

      <View style={s.access}>
        <Text style={s.accessTitle}>Who has access</Text>
        {paused ? <Banner tone="error">Workspace paused. All agent access is disabled until the owner reactivates.</Banner> : null}
        <AccessRow
          name={name}
          detail={paused ? 'Owner · workspace paused' : 'Owner · full control'}
          pill={paused ? <StatusPill label="Deactivated" tone="neutral" /> : <StatusPill label="Active" tone="good" />}
        />
        {agents.map((a) => (
          <AccessRow
            key={a.id}
            name={a.name || a.email}
            detail={paused ? 'Access paused' : 'Invitation sent'}
            pill={paused ? <StatusPill label="Paused" tone="neutral" /> : <StatusPill label="Invitation pending" tone="warn" />}
            action={{ label: 'Cancel invitation', onPress: () => removeAgent(a.id) }}
          />
        ))}
      </View>
    </Screen>
  );
}

function AccessRow({
  name,
  detail,
  pill,
  action,
}: {
  name: string;
  detail: string;
  pill: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={s.rowCard}>
      <View style={s.rowTop}>
        <Avatar name={name} size={40} />
        <View style={s.flex}>
          <Text style={s.rowName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.rowDetail}>{detail}</Text>
        </View>
        {pill}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.label}, ${name}`}
          onPress={action.onPress}
          style={({ pressed }) => [s.rowAction, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.rowActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
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
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 28, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.4, lineHeight: 35 },
  body: { fontFamily, fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: 'center', paddingHorizontal: 12 },
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
  cardTitle: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
  cardBody: { fontFamily, fontSize: 13, lineHeight: 19, color: colors.ink2, textAlign: 'center', paddingHorizontal: 8 },
  cardButton: { alignSelf: 'stretch', marginTop: 8 },
  access: { gap: 10 },
  accessTitle: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.ink },
  rowCard: {
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 12,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowAction: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rowActionText: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.bad },
  rowName: { fontFamily, fontSize: 15, fontWeight: '700', color: colors.ink },
  rowDetail: { fontFamily, fontSize: 13, color: colors.ink3, marginTop: 1 },
});
