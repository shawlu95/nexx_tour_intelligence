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
import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AiConsentSheet } from '../../../components/AiConsentSheet';
import { colors, fontFamily } from '../../../components/ui';
import type { AddressDraft } from '../../../lib/address';
import { useUserId } from '../../../lib/auth';
import { loadAiConsent } from '../../../lib/consent';
import { tapImpact, tapSuccess } from '../../../lib/haptics';
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
const SILENCE_SECONDS = 10; // mockup: "NORA checks in after 10 seconds of silence"

// stillRecording: the "Still recording?" check-in is open; the recorder keeps running.
type Phase = 'starting' | 'recording' | 'stillRecording' | 'saving' | 'tooShort' | 'denied' | 'confirmDiscard' | 'noSound';

const isRecording = (p: Phase) => p === 'recording' || p === 'stillRecording' || p === 'confirmDiscard';

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Record() {
  const userId = useUserId();
  const params = useLocalSearchParams<{ propertyId?: string; draft?: string; label?: string; place?: string }>();
  const draft = params.draft ? (JSON.parse(params.draft) as AddressDraft) : null;
  const recorder = useAudioRecorder(OPTIONS);
  const recState = useAudioRecorderState(recorder, 150);
  const [phase, setPhase] = useState<Phase>('starting');
  const [heardVoice, setHeardVoice] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const phaseRef = useRef<Phase>('starting');
  const lastVoiceMs = useRef(0); // recorder time when speech was last heard
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
    tapImpact();
    await activateKeepAwakeAsync('nora-recording');
    setHeardVoice(false);
    lastVoiceMs.current = 0;
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
    if (!isRecording(phaseRef.current)) return;
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
      typed_text: null,
    });
    tapSuccess();
    void runQueue({ force: true });
    router.dismissTo('/tour');
    router.push(`/tour/note/${visitId}`);
  }, [stopRecorder, userId, params.propertyId, params.label, draft, meterSeen, heardVoice]);

  // Ten seconds without speech: ask "Still recording?" while the recorder keeps going.
  // Only judged when this phone reports sound levels.
  useEffect(() => {
    if (voiceNow) lastVoiceMs.current = recState.durationMillis;
  }, [voiceNow, recState.durationMillis]);
  useEffect(() => {
    if (phase !== 'recording' || !meterSeen) return;
    const timer = setInterval(() => {
      if (recorder.getStatus().durationMillis - lastVoiceMs.current >= SILENCE_SECONDS * 1000) setPhaseNow('stillRecording');
    }, 500);
    return () => clearInterval(timer);
  }, [phase, meterSeen, recorder]);
  const keepRecording = () => {
    lastVoiceMs.current = recorder.getStatus().durationMillis;
    setPhaseNow('recording');
  };
  // "Auto-stops at 1:30": while recording, finish when the clip reaches 90 seconds.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'stillRecording') return;
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

  // The system alerts for the recording's three questions. Handlers go through a ref so
  // an alert always calls the current version.
  const handlers = useRef({ finish, keepRecording, discard, begin });
  useEffect(() => {
    handlers.current = { finish, keepRecording, discard, begin };
  });
  useEffect(() => {
    if (phase === 'stillRecording') {
      Alert.alert(
        'Still recording?',
        `I haven’t heard anything for ${SILENCE_SECONDS} seconds. Keep recording, or end this recording without saving a blank note.`,
        [
          { text: 'End Recording', onPress: () => void handlers.current.finish() },
          { text: 'Keep Recording', style: 'cancel', onPress: () => handlers.current.keepRecording() },
        ],
        { cancelable: false },
      );
    } else if (phase === 'confirmDiscard') {
      Alert.alert('Discard this recording?', 'Nothing will be saved for this home.', [
        { text: 'Keep Recording', style: 'cancel', onPress: () => setPhaseNow('recording') },
        { text: 'Discard', style: 'destructive', onPress: () => void handlers.current.discard() },
      ]);
    } else if (phase === 'noSound') {
      Alert.alert('I’m not hearing anything.', 'No note has been created. Try again, or cancel without saving a blank home.', [
        { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
        { text: 'Try Again', onPress: () => void handlers.current.begin() },
      ]);
    }
  }, [phase]);

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
      if (isRecording(phaseRef.current)) {
        recorder.stop().catch(() => undefined);
        deactivateKeepAwake('nora-recording');
      }
    };
  }, [begin, recorder]);

  const recording = isRecording(phase);
  const cityLine = `${params.place || 'Address entered'} · address confirmed`;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={s.stage}>
        <View style={s.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => (recording ? setPhaseNow('confirmDiscard') : router.back())}
            style={s.backButton}
            hitSlop={8}
          >
            <SymbolView name="xmark" tintColor="#FFFFFF" size={14} type="monochrome" weight="semibold" />
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

        {phase === 'tooShort' ? (
          <Pressable style={s.finish} onPress={begin} accessibilityRole="button">
            <Text style={s.finishText}>Record again</Text>
          </Pressable>
        ) : phase === 'denied' ? (
          <>
            <Pressable
              style={s.finish}
              onPress={() => router.replace({ pathname: '/tour/type', params })}
              accessibilityRole="button"
            >
              <Text style={s.finishText}>Type instead</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="link" hitSlop={8} style={s.settingsLink}>
              <Text style={s.settingsLinkText}>Turn on the microphone in Settings</Text>
            </Pressable>
          </>
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
              ? 'The microphone is off for NORA. Type your reaction, or turn the microphone on in Settings.'
              : `Listening · NORA checks in after ${SILENCE_SECONDS} seconds of silence`}
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
    </SafeAreaView>
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
  root: { flex: 1, backgroundColor: colors.stage },
  stage: { flex: 1, backgroundColor: colors.stage, alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonSpacer: { width: 44 },
  place: { flex: 1, alignItems: 'center', gap: 2 },
  placeTitle: { fontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  placeSub: { fontFamily, fontSize: 13, color: colors.stage2 },
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
  pillStrong: { fontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  pillDivider: { width: StyleSheet.hairlineWidth, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },
  pillSoft: { fontFamily, fontSize: 12, color: colors.stage2 },
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
  timer: { fontFamily, fontSize: 40.0, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1, fontVariant: ['tabular-nums'], marginTop: 6 },
  voice: { fontFamily, fontSize: 12, fontWeight: '700', color: '#91A8FA', marginTop: 6, minHeight: 18 },
  prompt: { fontFamily, fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 28, textAlign: 'center' },
  promptBody: { fontFamily, fontSize: 15, lineHeight: 22, color: colors.stage2, textAlign: 'center', marginTop: 10, paddingHorizontal: 6 },
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
  finishText: { fontFamily, fontSize: 17, fontWeight: '700', color: colors.ink },
  settingsLink: { marginTop: 14 },
  settingsLinkText: { fontFamily, fontSize: 15, fontWeight: '600', color: '#91A8FA', textDecorationLine: 'underline' },
  listening: { fontFamily, fontSize: 13, color: colors.stage2, marginTop: 16, textAlign: 'center' },
});
