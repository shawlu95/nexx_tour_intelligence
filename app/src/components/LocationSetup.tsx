// One-time location setup, from the mockup: shown after sign-in while the
// location permission hasn't been asked yet. Continue shows the iPhone's own
// prompt. There's deliberately no "Not now": App Review rejects pre-permission
// screens that let people skip the system prompt. Whatever the answer, the buyer
// can always type an address instead.
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientTile, OnboardingScreen, PopIn, brandFont } from './Onboarding';
import { colors, fontFamily } from './ui';

export function LocationSetup({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <OnboardingScreen glowY={0.42}>
      <View style={s.main}>
        <PopIn style={s.tileWrap}>
          <GradientTile size={78} radius={26}>
            <SymbolView name="location" tintColor={colors.accentDark} size={34} type="monochrome" />
          </GradientTile>
        </PopIn>
        <Text style={s.kicker}>ONE-TIME SETUP</Text>
        <Text style={s.title} accessibilityRole="header">
          Find each home automatically.
        </Text>
        <Text style={s.body}>NORA uses your location while the app is open to suggest the address of the home you’re touring.</Text>
        <View style={s.note}>
          <SymbolView name="checkmark.shield" tintColor={colors.good} size={22} type="monochrome" />
          <Text style={s.noteText}>Only the address you confirm is saved—not your raw GPS location.</Text>
        </View>
      </View>

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            await Location.requestForegroundPermissionsAsync().catch(() => null);
            setBusy(false);
            onDone();
          }}
          style={({ pressed }) => [s.continue, (pressed || busy) && { opacity: 0.85 }]}
        >
          <Text style={s.continueText}>Continue</Text>
        </Pressable>
        <Text style={s.small}>Your iPhone will show the location permission next. You can change it later in Settings.</Text>
      </View>
    </OnboardingScreen>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, justifyContent: 'center', alignItems: 'center', transform: [{ translateY: 12 }] },
  tileWrap: { marginBottom: 25 },
  kicker: { fontFamily, fontSize: 12, fontWeight: '800', letterSpacing: 1.35, color: colors.accent, marginBottom: 11 },
  title: {
    maxWidth: 325,
    fontFamily: brandFont,
    fontSize: 32,
    lineHeight: 34.5,
    letterSpacing: -1.6,
    color: colors.ink,
    textAlign: 'center',
  },
  body: { maxWidth: 320, fontFamily, fontSize: 15, lineHeight: 22.5, color: 'rgb(104,117,138)', textAlign: 'center', marginTop: 14 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 325,
    marginTop: 23,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgb(220,228,238)',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  noteText: { flex: 1, fontFamily, fontSize: 12, lineHeight: 17, color: 'rgb(95,106,124)' },
  actions: { paddingBottom: 4 },
  continue: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgb(33,150,255)',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 9 },
  },
  continueText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.accentDark },
  small: { maxWidth: 310, alignSelf: 'center', fontFamily, fontSize: 12, lineHeight: 17, color: 'rgb(125,135,151)', textAlign: 'center', marginTop: 11 },
});
