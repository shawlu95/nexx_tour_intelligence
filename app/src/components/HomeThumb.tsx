import { SymbolView } from 'expo-symbols';
import { Image, StyleSheet, View } from 'react-native';
import { useThumbnail, type Locatable } from '../lib/thumbnail';
import { colors } from './ui';

/** Street-level thumbnail of a home, or a house icon until one is available. */
export function HomeThumb({ home, size = 56 }: { home: Locatable | null | undefined; size?: number }) {
  const uri = useThumbnail(home);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.2) };
  if (uri) {
    return <Image source={{ uri }} style={[s.image, box]} accessibilityIgnoresInvertColors accessible={false} />;
  }
  return (
    <View style={[s.placeholder, box]} accessible={false}>
      <SymbolView name="house" tintColor={colors.ink3} size={Math.round(size * 0.42)} type="monochrome" />
    </View>
  );
}

const s = StyleSheet.create({
  image: { backgroundColor: colors.sunk },
  placeholder: { backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' },
});
