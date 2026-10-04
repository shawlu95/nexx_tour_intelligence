// "One quick question" from the mockup: after a note is ready, NORA may ask about
// one thing the buyer raised but left unclear. The answer is saved on the note and
// used by the ranking; "Skip for now" dismisses it.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { answerClarify } from '../lib/api';
import type { Clarify } from '../lib/types';
import { colors } from './ui';

const MARKS = ['🙂', '🤔', '✕'];

export function ClarifyCard({
  noteId,
  clarify,
  onAnswered,
  onError,
}: {
  noteId: string;
  clarify: Clarify;
  onAnswered: (answer: string) => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function choose(answer: string) {
    setSaving(answer);
    try {
      await answerClarify(noteId, answer);
      onAnswered(answer);
    } catch {
      onError("Couldn't save your answer. Check your connection.");
    }
    setSaving(null);
  }

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>ONE QUICK QUESTION</Text>
      <Text style={s.question} accessibilityRole="header">
        {clarify.question}
      </Text>
      {clarify.reason ? <Text style={s.reason}>{clarify.reason}</Text> : null}
      <View style={s.options}>
        {clarify.options.map((o, i) => (
          <Pressable
            key={o.label}
            accessibilityRole="button"
            accessibilityLabel={`${o.label}. ${o.detail}`}
            disabled={saving !== null}
            onPress={() => void choose(o.label)}
            style={({ pressed }) => [s.option, pressed && { opacity: 0.75 }]}
          >
            <Text style={s.mark}>{MARKS[i] ?? '•'}</Text>
            <View style={s.flex}>
              <Text style={s.label}>{o.label}</Text>
              {o.detail ? <Text style={s.detail}>{o.detail}</Text> : null}
            </View>
            {saving === o.label ? <ActivityIndicator color={colors.accent} /> : null}
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void choose('skipped')} disabled={saving !== null} hitSlop={8}>
        <Text style={s.skip}>Skip for now</Text>
      </Pressable>
    </View>
  );
}

/** The answered question, shown quietly under the note. */
export function ClarifyAnswer({ clarify, answer }: { clarify: Clarify; answer: string }) {
  const detail = clarify.options.find((o) => o.label === answer)?.detail;
  return (
    <View style={s.answered}>
      <Text style={s.answeredQ}>{clarify.question}</Text>
      <Text style={s.answeredA}>
        {answer}
        {detail ? ` · ${detail}` : ''}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    padding: 18,
    gap: 10,
  },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  question: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  reason: { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  options: { gap: 8, marginTop: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  mark: { fontSize: 20, width: 26, textAlign: 'center', color: colors.ink2 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  skip: { fontSize: 14, fontWeight: '600', color: colors.ink3, textAlign: 'center', marginTop: 4 },
  answered: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 12 },
  answeredQ: { fontSize: 13, color: colors.ink3 },
  answeredA: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
