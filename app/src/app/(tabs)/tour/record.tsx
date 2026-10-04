// Recording screen, recreated from the mockup. Recording starts as soon as the
// screen opens; Finish saves the clip and opens the note.
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AiConsentSheet } from '../../../components/AiConsentSheet';
import { colors, TabHeader } from '../../../components/ui';
import type { AddressDraft } from '../../../lib/address';
import { useUserId } from '../../../lib/auth';
import { loadAiConsent } from '../../../lib/consent';
import { addPending } from '../../../lib/localdb';
import { recordingsDir, runQueue } from '../../../lib/sync';

// Mono AAC at 48 kbps: clear speech, about 0.35 MB per minute. Metering drives "voice detected".
const OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 48000,
  directory: 'document',
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
};

const AUTO_STOP_SECONDS = 90; // "Auto-stops at 1:30"
const MIN_SECONDS = 5;
const VOICE_DB = -40; // metering above this counts as speech
const NO_SPEECH_SECONDS = 8; // mockup: "I'm not hearing anything." after 8 s of silence

type Phase = 'starting' | 'recording' | 'saving' | 'tooShort' | 'denied' | 'confirmDiscard' | 'noSound';

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Record() {
  const userId = useUserId();
  const params = useLocalSearchParams<{ propertyId?: string; draft?: string; label?: string }>();
  const draft = params.draft ? (JSON.parse(params.draft) as AddressDraft) : null;
  const recorder = useAudioRecorder(OPTIONS);
  const recState = useAudioRecorderState(recorder, 150);
  const [phase, setPhase] = useState<Phase>('starting');
  const [heardVoice, setHeardVoice] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const phaseRef = useRef<Phase>('starting');
  const setPhaseNow = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const elapsed = recState.durationMillis / 1000;
  const voiceNow = typeof recState.metering === 'number' && recState.metering > VOICE_DB;
  // "Voice detected" sticks once the meter has heard speech (derived during render).
  if (phase === 'recording' && voiceNow && !heardVoice) setHeardVoice(true);
  // Only judge silence if this phone reports sound levels at all.
  const [meterSeen, setMeterSeen] = useState(false);
  if (phase === 'recording' && typeof recState.metering === 'number' && !meterSeen) setMeterSeen(true);

  const begin = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setPhaseNow('denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await activateKeepAwakeAsync('nora-recording');
    setHeardVoice(false);
    setMeterSeen(false);
    setPhaseNow('recording');
  }, [recorder]);

  const stopRecorder = useCallback(async () => {
    const seconds = recorder.getStatus().durationMillis / 1000;
    await recorder.stop();
    deactivateKeepAwake('nora-recording');
    await setAudioModeAsync({ allowsRecording: false });
    return { seconds, uri: recorder.uri };
  }, [recorder]);

  const discardFile = (uri: string | null) => {
    if (!uri) return;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // nothing to clean up
    }
  };

  const finish = useCallback(async () => {
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'confirmDiscard') return;
    setPhaseNow('saving');
    const { seconds, uri } = await stopRecorder();
    if (meterSeen && !heardVoice) {
      // Nothing was said: don't save or send audio for transcription.
      discardFile(uri);
      return setPhaseNow('noSound');
    }
    if (seconds < MIN_SECONDS || !uri) {
      discardFile(uri);
      return setPhaseNow('tooShort');
    }
    const visitId = Crypto.randomUUID();
    const dest = new File(recordingsDir(), `${visitId}.m4a`);
    new File(uri).moveSync(dest);
    await addPending({
      id: visitId,
      user_id: userId,
      property_id: params.propertyId ?? null,
      property_draft: params.propertyId ? null : draft,
      address_label: params.label ?? draft?.addressLine ?? 'New home',
      recorded_at: new Date().toISOString(),
      duration_seconds: Math.round(seconds),
      file_uri: dest.uri,
    });
    void runQueue({ force: true });
    router.dismissTo('/tour');
    router.push(`/visit/${visitId}`);
  }, [stopRecorder, userId, params.propertyId, params.label, draft, meterSeen, heardVoice]);

  // Eight seconds of silence: stop, throw the clip away, and say so.
  const noSound = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhaseNow('saving');
    const { uri } = await stopRecorder();
    discardFile(uri);
    setPhaseNow('noSound');
  }, [stopRecorder]);
  useEffect(() => {
    if (phase !== 'recording' || heardVoice || !meterSeen) return;
    const remaining = NO_SPEECH_SECONDS * 1000 - recorder.getStatus().durationMillis;
    const timer = setTimeout(() => void noSound(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [phase, heardVoice, meterSeen, noSound, recorder]);
  // "Auto-stops at 1:30": while recording, finish when the clip reaches 90 seconds.
  useEffect(() => {
    if (phase !== 'recording') return;
    const remaining = AUTO_STOP_SECONDS * 1000 - recorder.getStatus().durationMillis;
    const timer = setTimeout(() => void finish(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [phase, finish, recorder]);

  async function discard() {
    const { uri } = await stopRecorder();
    discardFile(uri);
    setPhaseNow('starting');
    router.back();
  }

  // Start right away, as in the mockup (after asking for AI permission if it's off);
  // stop and throw away if the screen goes away mid-recording.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      loadAiConsent()
        .catch(() => null)
        .then((on) => (on === false ? setAskConsent(true) : void begin()));
    });
    return () => {
      cancelAnimationFrame(frame);
      if (phaseRef.current === 'recording' || phaseRef.current === 'confirmDiscard') {
        recorder.stop().catch(() => undefined);
        deactivateKeepAwake('nora-recording');
      }
    };
  }, [begin, recorder]);

  const recording = phase === 'recording' || phase === 'confirmDiscard';
  const place = draft?.city || '';
  const cityLine = `${place ? `${place} · ` : ''}location confirmed`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TabHeader />
      </View>
      <View style={s.stage}>
        <View style={s.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (recording ? setPhaseNow('confirmDiscard') : router.back())}
            style={s.backButton}
            hitSlop={8}
          >
            <SymbolView name="chevron.left" tintColor="#FFFFFF" size={14} type="monochrome" />
          </Pressable>
          <View style={s.place}>
            <Text style={s.placeTitle} numberOfLines={1}>
              {params.label}
            </Text>
            <Text style={s.placeSub}>{cityLine}</Text>
          </View>
          <View style={s.backButtonSpacer} />
        </View>

        <View style={s.pill}>
          <View style={[s.redDot, !recording && { opacity: 0.35 }]} />
          <Text style={s.pillStrong}>Recording</Text>
          <View style={s.pillDivider} />
          <Text style={s.pillSoft}>Auto-stops at 1:30</Text>
        </View>

        <Orb active={recording && voiceNow} />

        <Text style={s.timer} accessibilityLabel={`${Math.floor(elapsed)} seconds`}>
          {clock(recording || phase === 'saving' ? elapsed : 0)}
        </Text>
        <Text style={s.voice} accessibilityLiveRegion="polite">
          {phase === 'denied'
            ? 'Microphone access is off'
            : phase === 'tooShort'
              ? 'That was very short'
              : phase === 'saving'
                ? 'Saving…'
                : heardVoice
                  ? 'Voice detected · keep talking naturally'
                  : 'Waiting for your voice…'}
        </Text>

        <Text style={s.prompt}>Tell me what stood out.</Text>
        <Text style={s.promptBody}>Talk naturally about what you liked, disliked, and anything that could affect your decision.</Text>

        {phase === 'confirmDiscard' ? (
          <View style={s.confirm}>
            <Text style={s.confirmText}>Discard this recording?</Text>
            <View style={s.confirmRow}>
              <Pressable style={[s.smallButton, s.smallLight]} onPress={() => setPhaseNow('recording')} accessibilityRole="button">
                <Text style={s.smallLightText}>Keep recording</Text>
              </Pressable>
              <Pressable style={[s.smallButton, s.smallDanger]} onPress={discard} accessibilityRole="button">
                <Text style={s.smallDangerText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        ) : phase === 'tooShort' ? (
          <Pressable style={s.finish} onPress={begin} accessibilityRole="button">
            <Text style={s.finishText}>Record again</Text>
          </Pressable>
        ) : phase === 'denied' ? (
          <Pressable style={s.finish} onPress={() => Linking.openSettings()} accessibilityRole="button">
            <Text style={s.finishText}>Open Settings</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [s.finish, (pressed || phase !== 'recording') && { opacity: 0.8 }]}
            onPress={() => void finish()}
            disabled={phase !== 'recording'}
            accessibilityRole="button"
          >
            <View style={s.stopSquare} />
            <Text style={s.finishText}>Finish recording</Text>
          </Pressable>
        )}

        <Text style={s.listening}>
          {phase === 'tooShort'
            ? `Say a bit more: at least ${MIN_SECONDS} seconds.`
            : phase === 'denied'
              ? 'Turn on the microphone for NORA to record your reaction.'
              : 'Listening · your note stays private'}
        </Text>
      </View>
      <AiConsentSheet
        visible={askConsent}
        onDone={() => {
          // Either way the buyer can record; without permission the note waits until they allow it.
          setAskConsent(false);
          void begin();
        }}
      />
      <NotHearingDialog visible={phase === 'noSound'} onTryAgain={() => void begin()} onCancel={() => router.back()} />
    </SafeAreaView>
  );
}

/** Bottom sheet from the mockup, shown when the recording has no speech. Nothing is saved. */
function NotHearingDialog({ visible, onTryAgain, onCancel }: { visible: boolean; onTryAgain: () => void; onCancel: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.sheetIcon}>
            <View style={s.sheetDot} />
            <View style={s.sheetDot} />
            <View style={s.sheetDot} />
          </View>
          <Text style={s.sheetTitle} accessibilityRole="header">
            I’m not hearing anything.
          </Text>
          <Text style={s.sheetCopy}>No note has been created. Try again, or cancel without saving a blank home.</Text>
          <Pressable style={({ pressed }) => [s.sheetPrimary, pressed && { opacity: 0.85 }]} onPress={onTryAgain} accessibilityRole="button">
            <Text style={s.sheetPrimaryText}>Try again</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.sheetSecondary, pressed && { opacity: 0.7 }]} onPress={onCancel} accessibilityRole="button">
            <Text style={s.sheetSecondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The blue voice orb with two soft halos; it breathes while it hears you. */
function Orb({ active }: { active: boolean }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      Animated.timing(t, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, t]);
  const halo = (from: number, to: number) => ({ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }] });
  return (
    <View style={s.orbWrap} accessible={false}>
      <Animated.View style={[s.halo, s.haloOuter, halo(1, 1.06)]} />
      <Animated.View style={[s.halo, s.haloInner, halo(1, 1.04)]} />
      <View style={s.orb}>
        <SymbolView name="waveform" tintColor="rgba(255,255,255,0.7)" size={30} type="monochrome" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: colors.surface },
  stage: { flex: 1, backgroundColor: colors.stage, alignItems: 'center', paddingHorizontal: 24, paddingTop: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonSpacer: { width: 36 },
  place: { flex: 1, alignItems: 'center', gap: 2 },
  placeTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  placeSub: { fontSize: 13, color: colors.stage2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F05252' },
  pillStrong: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  pillDivider: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },
  pillSoft: { fontSize: 11, color: colors.stage2 },
  orbWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  halo: { position: 'absolute', borderRadius: 999 },
  haloOuter: { width: 200, height: 200, backgroundColor: 'rgba(49,100,244,0.08)' },
  haloInner: { width: 160, height: 160, backgroundColor: 'rgba(49,100,244,0.14)' },
  orb: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: '#2F56D9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3164F4',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  timer: { fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1, fontVariant: ['tabular-nums'], marginTop: 6 },
  voice: { fontSize: 12, fontWeight: '700', color: '#91A8FA', marginTop: 6, minHeight: 18 },
  prompt: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', marginTop: 28, textAlign: 'center' },
  promptBody: { fontSize: 15, lineHeight: 22, color: colors.stage2, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },
  finish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
  },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#E04848' },
  finishText: { fontSize: 17, fontWeight: '700', color: colors.ink },
  listening: { fontSize: 13, color: colors.stage2, marginTop: 16, textAlign: 'center' },
  confirm: { marginTop: 24, alignItems: 'center', gap: 12 },
  confirmText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  confirmRow: { flexDirection: 'row', gap: 10 },
  smallButton: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  smallLight: { backgroundColor: '#FFFFFF' },
  smallLightText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  smallDanger: { backgroundColor: '#F05252' },
  smallDangerText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  // "I'm not hearing anything." sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,24,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
    alignItems: 'center',
    gap: 12,
  },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 4,
  },
  sheetDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  sheetTitle: { fontSize: 23, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.3 },
  sheetCopy: { fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: 'center', paddingHorizontal: 16 },
  sheetPrimary: {
    alignSelf: 'stretch',
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  sheetSecondary: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
