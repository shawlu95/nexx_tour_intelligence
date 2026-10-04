import { StyleSheet, Text, View } from 'react-native';
import { initials } from '../lib/sharingPreview';
import { colors, fontFamily } from './ui';

/** Dark rounded square with initials, as in the mockup's account and sharing rows. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[s.box, { width: size, height: size, borderRadius: Math.round(size * 0.3) }]} accessible={false}>
      <Text style={[s.text, { fontFamily, fontSize: Math.round(size * 0.32) }]}>{initials(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5 },
});
