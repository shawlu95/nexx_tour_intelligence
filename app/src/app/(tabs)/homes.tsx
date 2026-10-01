import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HomeThumb } from '../../components/HomeThumb';
import { Banner, Body, Card, colors, Field, Screen, TabHeader } from '../../components/ui';
import { displayAddress } from '../../lib/address';
import { fetchProperties } from '../../lib/api';
import { formatHomeLine, formatWhen } from '../../lib/format';
import type { Property } from '../../lib/types';

export default function Properties() {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [query, setQuery] = useState('');
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchProperties()
        .then((r) => {
          setProperties(r.data);
          setOffline(r.offline);
          setError('');
        })
        .catch(() => setError("Couldn't load your homes. Check your connection."));
    }, []),
  );

  const q = query.trim().toLowerCase();
  const shown = (properties ?? []).filter(
    (p) => !q || `${displayAddress(p)} ${p.city ?? ''} ${p.postal_code ?? ''}`.toLowerCase().includes(q),
  );

  return (
    <Screen tab>
      <TabHeader title="Your homes" />
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Street, city or ZIP" autoCorrect={false} />
      {offline ? <Banner>{"You're offline. Showing your last saved list."}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {properties && shown.length === 0 ? (
        <Body muted>{q ? 'No homes match that search.' : 'Homes you record will appear here.'}</Body>
      ) : null}
      {shown.map((p) => (
        <Card key={p.id} onPress={() => router.push(`/properties/${p.id}`)}>
          <View style={s.row}>
            <HomeThumb home={p} />
            <View style={s.body}>
              <Text style={s.title} numberOfLines={1}>
                {displayAddress(p)}
              </Text>
              {formatHomeLine(p) ? (
                <Text style={s.meta} numberOfLines={1}>
                  {formatHomeLine(p)}
                </Text>
              ) : null}
              <Text style={s.meta} numberOfLines={1}>
                {[p.city, p.last_visited_at ? `last visit ${formatWhen(p.last_visited_at)}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.ink3 },
});
