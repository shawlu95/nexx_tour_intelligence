import { getForegroundPermissionsAsync } from 'expo-location';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocationSetup } from '../components/LocationSetup';
import SignIn from '../components/SignIn';
import { colors, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { listenForNotificationTaps, registerForPush } from '../lib/push';
import { startQueueTriggers } from '../lib/sync';

function Root() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;
  // The one-time location explanation, while the permission hasn't been asked yet.
  const [locationSetup, setLocationSetup] = useState<'checking' | 'needed' | 'done'>('checking');

  useEffect(() => {
    if (!userId) return;
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

  if (loading) return <Loading />;
  if (!session) return <SignIn />;
  if (locationSetup === 'checking') return <Loading />;
  if (locationSetup === 'needed') return <LocationSetup onDone={() => setLocationSetup('done')} />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.ink },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
      <Stack.Screen name="visit/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="share/[visitId]" options={{ title: 'Share', presentation: 'modal' }} />
      <Stack.Screen name="properties/[id]" options={{ title: 'Home' }} />
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
