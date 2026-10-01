import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Banner, Body, Button, Card, colors, Eyebrow, Loading, Screen } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { createShareLink, fetchVisit, listShareLinks, revokeShareLink } from '../../lib/api';
import { SHARE_BASE_URL } from '../../lib/config';
import { formatWhen } from '../../lib/format';
import type { ShareLink } from '../../lib/types';

export default function ShareScreen() {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const { data } = await fetchVisit(visitId);
      if (!data?.note) throw new Error('This note is not ready to share yet.');
      setNoteId(data.note.id);
      setAddress(displayAddress(data.property));
      setLinks(await listShareLinks(data.note.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sharing. Check your connection.");
    }
    setLoading(false);
  }, [visitId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const urlFor = (token: string) => `${SHARE_BASE_URL}/?t=${token}`;

  async function shareLink(link: ShareLink) {
    await Share.share({ message: `My notes on ${address}: ${urlFor(link.token)}` });
  }

  async function create() {
    if (!noteId) return;
    setBusy(true);
    setError('');
    try {
      const link = await createShareLink(noteId, includeTranscript);
      setLinks((l) => [link, ...l]);
      await shareLink(link);
    } catch {
      setError("Couldn't create the link. Check your connection.");
    }
    setBusy(false);
  }

  async function revoke(link: ShareLink) {
    try {
      await revokeShareLink(link.id);
      setLinks((l) => l.map((x) => (x.id === link.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    } catch {
      setError("Couldn't turn off the link. Check your connection.");
    }
  }

  if (loading) return <Loading />;

  const active = links.filter((l) => !l.revoked_at && new Date(l.expires_at).getTime() > now);

  return (
    <Screen>
      <Body>Send your agent a private link to this note. They open it in a browser; no account needed.</Body>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Card>
        <View style={s.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleTitle}>Include transcript</Text>
            <Text style={s.toggleHint}>Your exact words, as well as the note.</Text>
          </View>
          <Switch
            accessibilityLabel="Include transcript"
            value={includeTranscript}
            onValueChange={setIncludeTranscript}
            trackColor={{ true: colors.accent, false: colors.line }}
          />
        </View>
      </Card>
      <Body muted>Your own notes and the recording are never shared. Links expire after 90 days.</Body>
      <Button title="Create link and share" onPress={create} loading={busy} disabled={!noteId} />

      {active.length > 0 && (
        <View style={s.links}>
          <Eyebrow>Active links</Eyebrow>
          {active.map((link) => (
            <Card key={link.id}>
              <Text style={s.linkTitle}>
                Created {formatWhen(link.created_at)}
                {link.include_transcript ? ' · with transcript' : ''}
              </Text>
              <Text style={s.linkMeta}>
                Opened {link.view_count} {link.view_count === 1 ? 'time' : 'times'} · expires{' '}
                {new Date(link.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <View style={s.linkActions}>
                <Button kind="secondary" title="Send again" onPress={() => shareLink(link)} style={{ flex: 1 }} />
                <Button kind="secondary" title="Turn off" onPress={() => revoke(link)} style={{ flex: 1 }} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  toggleHint: { fontSize: 13, color: colors.ink3 },
  links: { gap: 10 },
  linkTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  linkMeta: { fontSize: 13, color: colors.ink3 },
  linkActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
