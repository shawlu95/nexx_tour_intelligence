import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, Card, colors, Eyebrow, Loading, Screen, Title } from '../../components/ui';
import { VisitRow } from '../../components/VisitRow';
import { displayAddress } from '../../lib/address';
import { deleteProperty, fetchProperty, type VisitSummary } from '../../lib/api';
import type { Property } from '../../lib/types';

export default function PropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ property: Property; visits: VisitSummary[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchProperty(id)
        .then((r) => {
          setData(r.data);
          setOffline(r.offline);
        })
        .catch(() => setError("Couldn't load this home. Check your connection."));
    }, [id]),
  );

  if (!data) return error ? <Screen><Banner tone="error">{error}</Banner></Screen> : <Loading />;
  const { property, visits } = data;
  const label = displayAddress(property);

  return (
    <Screen>
      <Stack.Screen options={{ title: property.address_line }} />
      <View style={s.header}>
        <Title>{label}</Title>
        <Text style={s.meta}>{[property.city, property.region].filter(Boolean).join(', ')}</Text>
      </View>
      {offline ? <Banner>{"You're offline. Showing the last saved version."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Button
        title="Record another reaction"
        onPress={() => router.push({ pathname: '/record/capture', params: { propertyId: property.id, label } })}
      />

      <View style={s.list}>
        <Eyebrow>
          {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
        </Eyebrow>
        {visits.map((v) => (
          <VisitRow
            key={v.id}
            address={label}
            showAddress={false}
            recordedAt={v.recorded_at}
            state={v.status}
            summary={v.status === 'failed' ? v.error : v.notes?.overall}
            onPress={() => router.push(`/visit/${v.id}`)}
          />
        ))}
      </View>

      {confirmDelete ? (
        <Card>
          <Text style={s.cardTitle}>Delete this home?</Text>
          <Body>All {visits.length} visits, recordings and notes for this home are deleted for good.</Body>
          <View style={s.row}>
            <Button kind="secondary" title="Cancel" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button
              kind="danger"
              title="Delete"
              loading={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                setBusy(true);
                try {
                  await deleteProperty(property.id);
                  router.dismissTo('/homes');
                } catch {
                  setError("Couldn't delete this home. Check your connection.");
                  setBusy(false);
                  setConfirmDelete(false);
                }
              }}
            />
          </View>
        </Card>
      ) : (
        <Button kind="ghost" title="Delete this home" onPress={() => setConfirmDelete(true)} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { gap: 4 },
  meta: { fontSize: 15, color: colors.ink3 },
  list: { gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
