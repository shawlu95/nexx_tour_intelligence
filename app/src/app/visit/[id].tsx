import { File } from 'expo-file-system';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { HomeHero } from '../../components/HomeHero';
import { NoteSections } from '../../components/NoteSections';
import { Banner, Body, Button, Card, colors, Eyebrow, Loading, Screen, Title } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { deleteVisit, fetchVisit, retryVisit, updatePersonalNote, type VisitDetail } from '../../lib/api';
import { formatClock, formatWhen } from '../../lib/format';
import { getPending, removePending, type PendingVisit } from '../../lib/localdb';
import { onQueueChange, runQueue } from '../../lib/sync';
import type { NoteItem } from '../../lib/types';

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [pending, setPending] = useState<PendingVisit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const local = await getPending(id);
    setPending(local);
    try {
      const result = await fetchVisit(id);
      setDetail(result.data);
      setOffline(result.offline);
    } catch {
      setOffline(true);
    }
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => onQueueChange(() => void load()), [load]);

  const status = detail?.visit.status;
  const waiting = status === undefined ? !!pending : status === 'uploading' || status === 'processing';
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  if (!loaded) return <Loading />;

  if (!detail && !pending) {
    return (
      <Screen>
        <Banner tone="error">{offline ? "You're offline and this note isn't saved on this phone yet." : 'This note no longer exists.'}</Banner>
        <Button kind="secondary" title="Back to home" onPress={() => router.dismissTo('/tour')} />
      </Screen>
    );
  }

  const address = detail ? displayAddress(detail.property) : (pending?.address_label ?? '');
  const recordedAt = detail?.visit.recorded_at ?? pending!.recorded_at;
  const duration = detail?.visit.duration_seconds ?? pending!.duration_seconds;

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      {detail ? (
        <HomeHero
          home={detail.property}
          eyebrow={`${formatWhen(recordedAt)} · ${formatClock(duration)} reaction`}
          onPress={() => router.push(`/properties/${detail.property.id}`)}
        />
      ) : (
        <View style={s.header}>
          <Eyebrow>
            {formatWhen(recordedAt)} · {formatClock(duration)} reaction
          </Eyebrow>
          <Title>{address}</Title>
        </View>
      )}

      {offline ? <Banner>{"You're offline. Showing the last saved version."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {status === 'ready' && detail ? (
        <ReadyNote detail={detail} pending={pending} onChanged={setDetail} onError={setError} />
      ) : (
        <Progress detail={detail} pending={pending} onRetried={load} onError={setError} />
      )}
    </Screen>
  );
}

function Progress({
  detail,
  pending,
  onRetried,
  onError,
}: {
  detail: VisitDetail | null;
  pending: PendingVisit | null;
  onRetried: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const status = detail?.visit.status;

  if (status === 'failed') {
    return (
      <Card>
        <Text style={s.cardTitle}>{"We couldn't write this note"}</Text>
        <Body>{detail?.visit.error ?? 'Something went wrong.'} Your recording is safe.</Body>
        <Button
          title="Try again"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await retryVisit(detail!.visit.id);
              onRetried();
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Could not retry.');
            }
            setBusy(false);
          }}
        />
      </Card>
    );
  }

  const processing = status === 'processing' || pending?.stage === 'submitted';
  return (
    <Card style={s.progress}>
      <ActivityIndicator color={colors.accent} />
      <Text style={s.cardTitle}>{processing ? 'Writing your note' : 'Saved on this phone'}</Text>
      <Body muted style={{ textAlign: 'center' }}>
        {processing
          ? "Usually under 30 seconds. You can leave this screen; we'll let you know when it's ready."
          : 'It uploads as soon as you have a connection.'}
      </Body>
      {pending?.last_error && !processing ? <Text style={s.retry}>Last try: {pending.last_error}</Text> : null}
      {!processing ? (
        <Button
          kind="secondary"
          title="Try uploading now"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await runQueue({ force: true });
            onRetried();
            setBusy(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function ReadyNote({
  detail,
  pending,
  onChanged,
  onError,
}: {
  detail: VisitDetail;
  pending: PendingVisit | null;
  onChanged: (d: VisitDetail) => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [personal, setPersonal] = useState(detail.note?.personal_note ?? '');
  const [confirm, setConfirm] = useState<'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const note = detail.note;

  const setItems = (items: NoteItem[]) => onChanged({ ...detail, items });

  return (
    <View style={s.ready}>
      <View style={s.noteCard}>
        <Eyebrow color={colors.ink3}>Your reaction</Eyebrow>
        {note ? <Text style={s.overall}>{note.overall}</Text> : null}

        {note ? (
          <NoteSections noteId={note.id} items={detail.items} editing={editing} onChange={setItems} onError={onError} />
        ) : null}

        {note && detail.items.length === 0 && !editing ? (
          <Body muted>No specific points were picked up. Tap Edit to add your own.</Body>
        ) : null}
      </View>

      {note && (editing || personal) ? (
        <View style={s.personal}>
          <Eyebrow color={colors.ink2}>Your own notes</Eyebrow>
          {editing ? (
            <TextInput
              accessibilityLabel="Your own notes"
              style={s.personalInput}
              value={personal}
              onChangeText={setPersonal}
              onEndEditing={async () => {
                try {
                  await updatePersonalNote(note.id, personal.trim());
                } catch {
                  onError("Couldn't save your notes. Check your connection.");
                }
              }}
              placeholder="Anything else you want to remember"
              placeholderTextColor={colors.ink3}
              multiline
            />
          ) : (
            <Body>{personal}</Body>
          )}
        </View>
      ) : null}

      {editing ? (
        <Button title="Done editing" onPress={() => setEditing(false)} />
      ) : (
        <>
          {confirm === null ? (
            <View style={s.chips}>
              <Button kind="secondary" title="Edit note" onPress={() => setEditing(true)} style={s.chip} />
              <Button kind="ghost" title="Delete note" onPress={() => setConfirm('delete')} style={s.chip} />
            </View>
          ) : (
            <Card>
              <Text style={s.cardTitle}>Delete this note?</Text>
              <Body>The transcript and note are deleted for good. Share links stop working.</Body>
              <View style={s.actions}>
                <Button kind="secondary" title="Cancel" onPress={() => setConfirm(null)} />
                <Button
                  kind="danger"
                  title="Delete"
                  loading={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      await deleteVisit(detail.visit);
                      if (pending) {
                        const f = new File(pending.file_uri);
                        if (f.exists) f.delete();
                        await removePending(pending.id);
                      }
                      router.dismissTo('/tour');
                    } catch (e) {
                      onError(e instanceof Error ? e.message : 'That did not work. Try again.');
                    }
                    setBusy(false);
                    setConfirm(null);
                  }}
                />
              </View>
            </Card>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { gap: 6 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600', marginTop: 4 },
  ready: { gap: 16 },
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
  },
  overall: { fontSize: 18, lineHeight: 27, color: colors.ink },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1 },
  personal: { gap: 8 },
  personalInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  actions: { gap: 10 },
  progress: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  retry: { fontSize: 13, color: colors.ink3, textAlign: 'center' },
});
