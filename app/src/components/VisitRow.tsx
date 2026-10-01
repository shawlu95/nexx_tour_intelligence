import { StyleSheet, Text, View } from 'react-native';
import { displayAddress } from '../lib/address';
import type { PropertyCard } from '../lib/api';
import { formatHomeLine, formatWhen } from '../lib/format';
import type { VisitStatus } from '../lib/types';
import { HomeThumb } from './HomeThumb';
import { Card, colors, StatusPill } from './ui';

export type RowState = VisitStatus | 'waiting';

const STATE_LABEL: Record<RowState, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } | null> = {
  waiting: { label: 'Waiting to upload', tone: 'neutral' },
  uploading: { label: 'Uploading', tone: 'neutral' },
  processing: { label: 'Writing note', tone: 'warn' },
  failed: { label: 'Needs attention', tone: 'bad' },
  ready: null,
};

/**
 * One visit in a list. Pass the property as `address` to show its thumbnail and
 * facts; pass a plain string for recordings not yet on the server.
 * On a home's own page (`showAddress={false}`) the date is the title instead.
 */
export function VisitRow({
  address,
  recordedAt,
  state,
  summary,
  showAddress = true,
  onPress,
}: {
  address: PropertyCard | string;
  recordedAt: string;
  state: RowState;
  summary?: string | null;
  showAddress?: boolean;
  onPress: () => void;
}) {
  const pill = STATE_LABEL[state];
  const home = typeof address === 'string' ? null : address;
  const title = home ? displayAddress(home) : (address as string);
  const facts = home ? formatHomeLine(home) : '';
  return (
    <Card onPress={onPress}>
      <View style={s.row}>
        {showAddress ? <HomeThumb home={home} /> : null}
        <View style={s.body}>
          <View style={s.top}>
            <Text style={s.title} numberOfLines={1}>
              {showAddress ? title : formatWhen(recordedAt)}
            </Text>
            {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
          </View>
          {showAddress ? (
            <Text style={s.meta} numberOfLines={1}>
              {[formatWhen(recordedAt), facts].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>
      {summary ? (
        <Text style={s.summary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, gap: 3 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 13, color: colors.ink3 },
  summary: { fontSize: 14, lineHeight: 20, color: colors.ink2, marginTop: 4 },
});
