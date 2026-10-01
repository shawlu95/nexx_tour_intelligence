import { StyleSheet, Text, View } from 'react-native';
import { displayAddress } from '../lib/address';
import { formatWhen } from '../lib/format';
import type { VisitStatus } from '../lib/types';
import { Card, colors, StatusPill } from './ui';

export type RowState = VisitStatus | 'waiting';

const STATE_LABEL: Record<RowState, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } | null> = {
  waiting: { label: 'Waiting to upload', tone: 'neutral' },
  uploading: { label: 'Uploading', tone: 'neutral' },
  processing: { label: 'Writing note', tone: 'warn' },
  failed: { label: 'Needs attention', tone: 'bad' },
  ready: null,
};

export function VisitRow({
  address,
  recordedAt,
  state,
  summary,
  showAddress = true,
  onPress,
}: {
  address: { address_line: string; unit?: string | null } | string;
  recordedAt: string;
  state: RowState;
  summary?: string | null;
  showAddress?: boolean;
  onPress: () => void;
}) {
  const pill = STATE_LABEL[state];
  const title = typeof address === 'string' ? address : displayAddress(address);
  return (
    <Card onPress={onPress}>
      <View style={s.top}>
        <Text style={s.title} numberOfLines={1}>
          {showAddress ? title : formatWhen(recordedAt)}
        </Text>
        {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
      </View>
      {showAddress ? <Text style={s.when}>{formatWhen(recordedAt)}</Text> : null}
      {summary ? (
        <Text style={s.summary} numberOfLines={2}>
          {summary}
        </Text>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.ink },
  when: { fontSize: 13, color: colors.ink3 },
  summary: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
});
