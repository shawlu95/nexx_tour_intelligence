import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SignIn from '../components/SignIn';
import { colors, Loading } from '../components/ui';
import { AuthProvider, useAuth } from '../lib/auth';
import { listenForNotificationTaps, registerForPush } from '../lib/push';
import { startQueueTriggers } from '../lib/sync';

function Root() {
  const { session, loading } = useAuth();
  const userId = session?.user.id;

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
      <Stack.Screen name="record/pick" options={{ title: '' }} />
      <Stack.Screen
        name="record/capture"
        options={{
          title: 'Record',
          headerStyle: { backgroundColor: colors.stage },
          headerTitleStyle: { color: colors.stageInk },
          headerTintColor: colors.stageInk,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="visit/[id]" options={{ title: 'Note' }} />
      <Stack.Screen name="share/[visitId]" options={{ title: 'Share', presentation: 'modal' }} />
      <Stack.Screen name="properties/[id]" options={{ title: 'Home' }} />
      <Stack.Screen name="ranking/discuss" options={{ title: 'Discuss' }} />
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
