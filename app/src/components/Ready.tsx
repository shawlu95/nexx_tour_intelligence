// "You're ready" from the mockup, shown once after a new sign-in on this phone:
// the check tile pops in, then Start with NORA continues into the app.
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientTile, OnboardingScreen, PopIn, brandFont } from './Onboarding';
import { colors, fontFamily } from './ui';

export function Ready({ firstName, onStart }: { firstName: string | null; onStart: () => void }) {
  return (
    <OnboardingScreen glowY={0.36}>
      <View style={s.main}>
        <PopIn style={s.tileWrap}>
          <GradientTile size={76} radius={25}>
            <SymbolView name="checkmark" tintColor={colors.accentDark} size={28} type="monochrome" weight="medium" />
          </GradientTile>
        </PopIn>
        <Text style={s.kicker}>PRIVATE WORKSPACE CREATED</Text>
        <Text style={s.title} accessibilityRole="header">
          {firstName ? `You’re ready, ${firstName}.` : 'You’re ready.'}
        </Text>
        <Text style={s.body}>
          Your home-search memory starts here. Capture what matters, compare your favorites, and share your insights with your agent.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [s.start, pressed && { opacity: 0.85 }]}
        >
          <Text style={s.startText}>Start with NORA</Text>
        </Pressable>
      </View>
    </OnboardingScreen>
  );
}

const s = StyleSheet.create({
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingBottom: 36 },
  tileWrap: { marginBottom: 28 },
  kicker: { fontFamily, fontSize: 12, fontWeight: '800', letterSpacing: 1.35, color: colors.accent, marginBottom: 12 },
  title: { fontFamily: brandFont, fontSize: 30.5, lineHeight: 33, letterSpacing: -1.4, color: colors.ink, textAlign: 'center' },
  body: {
    maxWidth: 300,
    fontFamily,
    fontSize: 15,
    lineHeight: 22.5,
    color: 'rgb(104,117,138)',
    textAlign: 'center',
    marginTop: 13,
    marginBottom: 31,
  },
  start: {
    alignSelf: 'stretch',
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
  startText: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.accentDark },
});
