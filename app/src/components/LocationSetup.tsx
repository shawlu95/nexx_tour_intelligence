// One-time setup from the mockup, shown after sign-in while the location
// permission hasn't been asked yet. It explains the permission, then Continue
// shows the iPhone's own prompt. There's deliberately no "Not now" here: App
// Review rejects pre-permission screens that let people skip the system prompt.
// Whatever the answer, the buyer can always type an address instead.
import * as Location from 'expo-location';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Button, colors, fontFamily, Screen } from './ui';

export function LocationSetup({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Screen style={s.screen}>
      <Text style={s.logo}>NORA</Text>
      <View style={s.body}>
        <View style={s.icon}>
          <SymbolView name="location.fill" tintColor={colors.accent} size={26} type="monochrome" />
        </View>
        <Text style={s.eyebrow}>ONE-TIME SETUP</Text>
        <Text style={s.title} accessibilityRole="header">
          Find each home automatically.
        </Text>
        <Text style={s.copy}>NORA uses your location while the app is open to suggest the address of the home you’re touring.</Text>
        <Text style={s.copy}>Only the address you confirm is saved, not your raw GPS location.</Text>
      </View>
      <View style={s.footer}>
        <Button
          title="Continue"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await Location.requestForegroundPermissionsAsync().catch(() => null);
            setBusy(false);
            onDone();
          }}
        />
        <Text style={s.note}>Your iPhone will show the location permission next. You can change it later in Settings.</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingTop: 70 },
  logo: { fontFamily, fontSize: 15, fontWeight: '800', letterSpacing: 4, color: colors.ink },
  body: { gap: 12 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eyebrow: { fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.accent },
  title: { fontFamily, fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  copy: { fontFamily, fontSize: 16, lineHeight: 23, color: colors.ink2 },
  footer: { gap: 12 },
  note: { fontFamily, fontSize: 13, lineHeight: 18, color: colors.ink3, textAlign: 'center' },
});
