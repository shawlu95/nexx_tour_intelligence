import { Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { getForegroundPermissionsAsync } from 'expo-location';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocationSetup } from '../components/LocationSetup';
import { Ready } from '../components/Ready';
import SignIn from '../components/SignIn';
import { Loading, nativeHeader } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { cacheGet, cacheSet } from '../lib/localdb';
import { listenForNotificationTaps, registerForPush } from '../lib/push';
import { startQueueTriggers } from '../lib/sync';

function Root() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  // Manrope (the mockup's headline face) is loaded at runtime, so it needs no native rebuild.
  const [fontsLoaded, fontError] = useFonts({ Manrope_800ExtraBold });
  // After signing in: "You're ready" once (forgotten on sign-out), then the
  // one-time location explanation while the permission hasn't been asked yet.
  const [ready, setReady] = useState<'checking' | 'show' | 'done'>('checking');
  const [locationSetup, setLocationSetup] = useState<'checking' | 'needed' | 'done'>('checking');

  useEffect(() => {
    if (!userId) return;
    cacheGet<boolean>(`ready:${userId}`)
      .then((seen) => setReady(seen ? 'done' : 'show'))
      .catch(() => setReady('done'));
    getForegroundPermissionsAsync()
      .then((p) => setLocationSetup(p.status === 'undetermined' ? 'needed' : 'done'))
      .catch(() => setLocationSetup('done'));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const stopQueue = startQueueTriggers();
    const stopTaps = listenForNotificationTaps();
    registerForPush(userId).catch((e) => console.warn('push registration failed', e));
    return () => {
      stopQueue();
      stopTaps();
    };
  }, [userId]);

  if (loading || (!fontsLoaded && !fontError)) return <Loading />; // a font that fails to load falls back to the system font
  if (!session) return <SignIn />;
  if (ready === 'checking' || locationSetup === 'checking') return <Loading />;
  if (ready === 'show') {
    const meta = (session.user.user_metadata ?? {}) as { full_name?: string; name?: string };
    const firstName = (meta.full_name ?? meta.name ?? '').trim().split(/\s+/)[0] || null;
    return (
      <Ready
        firstName={firstName}
        onStart={() => {
          void cacheSet(`ready:${userId}`, true);
          setReady('done');
        }}
      />
    );
  }
  if (locationSetup === 'needed') return <LocationSetup onDone={() => setLocationSetup('done')} />;

  return (
    <Stack
      screenOptions={nativeHeader}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
      <Stack.Screen name="visit/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="share/[visitId]" options={{ title: 'Share', presentation: 'modal' }} />
      <Stack.Screen name="properties/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="reaction/[visitId]" options={{ presentation: 'modal', title: 'Edit Reaction' }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    // Gesture Handler (used by the ranking's drag-to-reorder) needs a root view.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <Root />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
