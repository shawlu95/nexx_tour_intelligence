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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../components/ui';
import type { AddressDraft } from '../../lib/address';
import { useUserId } from '../../lib/auth';
import { RECORDING } from '../../lib/config';
import { CUES, cueIndex, formatClock } from '../../lib/format';
import { addPending } from '../../lib/localdb';
import { recordingsDir, runQueue } from '../../lib/sync';

// Mono AAC at 48 kbps: clear speech, about 0.35 MB per minute.
const OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 48000,
  directory: 'document',
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
};

type Phase = 'ready' | 'recording' | 'review' | 'saving';

export default function Capture() {
  const userId = useUserId();
  const params = useLocalSearchParams<{ propertyId?: string; draft?: string; label?: string }>();
  const recorder = useAudioRecorder(OPTIONS);
  const recState = useAudioRecorderState(recorder, 200);
  const [phase, setPhase] = useState<Phase>('ready');
  const [duration, setDuration] = useState(0);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);
  const phaseRef = useRef<Phase>('ready');
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const elapsed = phase === 'recording' ? recState.durationMillis / 1000 : duration;

  const discardFile = useCallback((uri: string | null) => {
    if (!uri) return;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // Nothing to clean up.
    }
  }, []);

  async function start() {
    setMessage('');
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setMessage('NORA needs the microphone to record your reaction. Turn it on in Settings.');
      setNeedsSettings(true);
      return;
    }
    discardFile(fileUri);
    setFileUri(null);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await activateKeepAwakeAsync('nora-recording');
    phaseRef.current = 'recording';
    setPhase('recording');
    // Stop automatically at the time limit.
    autoStop.current = setTimeout(() => void stop(), RECORDING.maxSeconds * 1000);
  }

  const stop = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    phaseRef.current = 'review';
    if (autoStop.current) clearTimeout(autoStop.current);
    const seconds = recorder.getStatus().durationMillis / 1000;
    await recorder.stop();
    deactivateKeepAwake('nora-recording');
    await setAudioModeAsync({ allowsRecording: false });
    setDuration(seconds);
    setFileUri(recorder.uri);
    setPhase('review');
    if (seconds < RECORDING.minSeconds) setMessage('That was very short. Record again and say a bit more.');
  }, [recorder]);

  // Leaving the screen mid-recording discards it.
  useEffect(() => {
    return () => {
      if (autoStop.current) clearTimeout(autoStop.current);
      if (phaseRef.current === 'recording') {
        recorder.stop().catch(() => undefined);
        deactivateKeepAwake('nora-recording');
      }
    };
  }, [recorder]);

  async function save() {
    if (!fileUri) return;
    setPhase('saving');
    try {
      const visitId = Crypto.randomUUID();
      const dest = new File(recordingsDir(), `${visitId}.m4a`);
      new File(fileUri).moveSync(dest);
      const draft = params.draft ? (JSON.parse(params.draft) as AddressDraft) : null;
      await addPending({
        id: visitId,
        user_id: userId,
        property_id: params.propertyId ?? null,
        property_draft: params.propertyId ? null : draft,
        address_label: params.label ?? draft?.addressLine ?? 'New home',
        recorded_at: new Date().toISOString(),
        duration_seconds: Math.round(duration),
        file_uri: dest.uri,
      });
      void runQueue({ force: true });
      router.dismissTo('/');
      router.push(`/visit/${visitId}`);
    } catch (e) {
      setPhase('review');
      setMessage(`Couldn't save the recording: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const progress = Math.min(elapsed / RECORDING.targetSeconds, 1);
  const enough = elapsed >= RECORDING.goodSeconds;
  const cue = CUES[cueIndex(phase === 'recording' ? elapsed : 0)];
  const tooShort = phase === 'review' && duration < RECORDING.minSeconds;

  return (
    <SafeAreaView style={s.root} edges={['bottom', 'left', 'right']}>
      <View style={s.body}>
        <Text style={s.address} numberOfLines={1}>
          {params.label}
        </Text>

        <View style={s.clockBlock}>
          <Text style={s.clock} accessibilityLabel={`${Math.floor(elapsed)} seconds`}>
            {formatClock(elapsed)}
          </Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${progress * 100}%`, backgroundColor: enough ? '#5FCB92' : '#7D9BFF' }]} />
          </View>
          <Text style={s.hint}>
            {phase === 'recording'
              ? enough
                ? "That's plenty. Stop whenever you're done."
                : 'Aim for 40 seconds to a minute'
              : phase === 'review'
                ? 'Saved on this phone until you choose'
                : `Stops on its own at ${formatClock(RECORDING.maxSeconds)}`}
          </Text>
        </View>

        <View style={s.cue} accessibilityLiveRegion="polite">
          <Text style={s.cueTitle}>{phase === 'review' ? 'Happy with it?' : cue.title}</Text>
          <Text style={s.cueHint}>
            {phase === 'review' ? 'Save to write your note, or record again.' : cue.hint}
          </Text>
          {phase !== 'review' && (
            <View style={s.dots}>
              {CUES.map((c, i) => (
                <View key={c.title} style={[s.dot, i === cueIndex(phase === 'recording' ? elapsed : 0) && s.dotOn]} />
              ))}
            </View>
          )}
        </View>

        {message ? (
          <View style={s.message}>
            <Text style={s.messageText}>{message}</Text>
            {needsSettings ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()}>
                <Text style={s.link}>Open Settings</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={s.controls}>
        {phase === 'ready' && <Control label="Start recording" tone="record" onPress={start} />}
        {phase === 'recording' && <Control label="Stop" tone="record" onPress={stop} />}
        {(phase === 'review' || phase === 'saving') && (
          <>
            <Control label="Record again" tone="plain" onPress={start} disabled={phase === 'saving'} />
            <Control label={phase === 'saving' ? 'Saving…' : 'Save'} tone="save" onPress={save} disabled={tooShort || phase === 'saving'} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Control({
  label,
  tone,
  onPress,
  disabled,
}: {
  label: string;
  tone: 'record' | 'save' | 'plain';
  onPress: () => void;
  disabled?: boolean;
}) {
  const bg = { record: '#F05252', save: '#7D9BFF', plain: '#1A2438' }[tone];
  const fg = tone === 'save' ? colors.stage : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.control, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}
    >
      <Text style={[s.controlText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  body: { flex: 1, padding: 24, gap: 32, justifyContent: 'center' },
  address: { color: colors.stage2, fontSize: 15, textAlign: 'center' },
  clockBlock: { alignItems: 'center', gap: 14 },
  clock: { color: colors.stageInk, fontSize: 64, fontWeight: '300', fontVariant: ['tabular-nums'] },
  track: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.stageLine, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  hint: { color: colors.stage2, fontSize: 14 },
  cue: { alignItems: 'center', gap: 8, minHeight: 110 },
  cueTitle: { color: colors.stageInk, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  cueHint: { color: colors.stage2, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.stageLine },
  dotOn: { backgroundColor: '#7D9BFF' },
  message: { backgroundColor: '#2A3550', borderRadius: 10, padding: 12, gap: 6 },
  messageText: { color: colors.stageInk, fontSize: 14, lineHeight: 20 },
  link: { color: '#9DB4FF', fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.stageLine },
  control: { flex: 1, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  controlText: { fontSize: 17, fontWeight: '700' },
});
