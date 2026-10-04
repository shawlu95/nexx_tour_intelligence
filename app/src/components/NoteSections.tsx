import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addItem, deleteItem, updateItemText } from '../lib/api';
import { KIND_LABELS, type ItemKind, type NoteItem } from '../lib/types';
import { colors, fontFamily } from './ui';

const KIND_COLOR: Record<ItemKind, string> = { liked: colors.good, concern: colors.warn, question: colors.accent };
const ADD_PLACEHOLDER: Record<ItemKind, string> = {
  liked: 'Add something you liked',
  concern: 'Add a concern',
  question: 'Add a question for your agent',
};

export function NoteSections({
  noteId,
  items,
  editing,
  onChange,
  onError,
}: {
  noteId: string;
  items: NoteItem[];
  editing: boolean;
  onChange: (items: NoteItem[]) => void;
  onError: (message: string) => void;
}) {
  const kinds: ItemKind[] = ['liked', 'concern', 'question'];
  return (
    <View style={s.sections}>
      {kinds.map((kind) => {
        const list = items.filter((i) => i.kind === kind);
        if (!editing && list.length === 0) return null;
        return (
          <View key={kind} style={s.section}>
            <Text style={[s.heading, { color: KIND_COLOR[kind] }]}>{KIND_LABELS[kind].toUpperCase()}</Text>
            {list.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                editing={editing}
                onSave={async (text) => {
                  const previous = items;
                  onChange(items.map((i) => (i.id === item.id ? { ...i, text, edited: true } : i)));
                  try {
                    await updateItemText(item.id, text);
                  } catch {
                    onChange(previous);
                    onError("Couldn't save that change. Check your connection.");
                  }
                }}
                onDelete={async () => {
                  const previous = items;
                  onChange(items.filter((i) => i.id !== item.id));
                  try {
                    await deleteItem(item.id);
                  } catch {
                    onChange(previous);
                    onError("Couldn't delete that point. Check your connection.");
                  }
                }}
              />
            ))}
            {editing && (
              <AddRow
                placeholder={ADD_PLACEHOLDER[kind]}
                onAdd={async (text) => {
                  try {
                    const created = await addItem(noteId, kind, text, list.length + 100);
                    onChange([...items, created]);
                  } catch {
                    onError("Couldn't add that point. Check your connection.");
                  }
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ItemRow({
  item,
  editing,
  onSave,
  onDelete,
}: {
  item: NoteItem;
  editing: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}) {
  const [showQuote, setShowQuote] = useState(false);
  const [draft, setDraft] = useState(item.text);

  if (editing) {
    return (
      <View style={s.editRow}>
        <TextInput
          accessibilityLabel="Edit point"
          style={s.editInput}
          value={draft}
          onChangeText={setDraft}
          onEndEditing={() => {
            const text = draft.trim();
            if (text && text !== item.text) onSave(text);
            else setDraft(item.text);
          }}
          multiline
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete "${item.text}"`} onPress={onDelete} hitSlop={8}>
          <Text style={s.delete}>Delete</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.item}>
      <View style={s.itemTop}>
        <Text style={s.itemText}>
          {item.text}
          {item.origin === 'buyer' ? <Text style={s.mine}>  added by you</Text> : null}
        </Text>
        {item.quote ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showQuote ? 'Hide what you said' : 'Show what you said'}
            accessibilityState={{ expanded: showQuote }}
            onPress={() => setShowQuote((v) => !v)}
            hitSlop={8}
            style={s.sourceButton}
          >
            <Text style={s.sourceText}>{showQuote ? 'Hide' : 'Source'}</Text>
          </Pressable>
        ) : null}
      </View>
      {showQuote && item.quote ? <Text style={s.quote}>“{item.quote}”</Text> : null}
    </View>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    await onAdd(value);
    setText('');
    setBusy(false);
  }
  return (
    <View style={s.editRow}>
      <TextInput
        accessibilityLabel={placeholder}
        style={s.editInput}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <Pressable accessibilityRole="button" onPress={submit} disabled={!text.trim() || busy} hitSlop={8}>
        <Text style={[s.add, (!text.trim() || busy) && { opacity: 0.4 }]}>Add</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  sections: { gap: 20 },
  section: { gap: 10 },
  heading: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  item: { gap: 6 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1, fontFamily, fontSize: 16, lineHeight: 22, color: colors.ink },
  mine: { fontFamily, fontSize: 12, color: colors.ink3 },
  sourceButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  sourceText: { fontFamily, fontSize: 12, color: colors.ink2, fontWeight: '600' },
  quote: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.ink2, fontStyle: 'italic', borderLeftWidth: 2, borderLeftColor: colors.line, paddingLeft: 10 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily, fontSize: 15,
    color: colors.ink,
  },
  delete: { color: colors.bad, fontFamily, fontSize: 14, fontWeight: '600' },
  add: { color: colors.accent, fontFamily, fontSize: 15, fontWeight: '700' },
});
