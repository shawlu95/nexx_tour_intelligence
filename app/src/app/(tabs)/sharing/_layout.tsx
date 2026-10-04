import { Stack } from 'expo-router';
import { nativeHeader } from '../../../components/ui';

// Sharing's own stack, with the system navigation bar on pushed screens.
export default function SharingLayout() {
  return (
    <Stack screenOptions={nativeHeader}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Sharing' }} />
      <Stack.Screen name="invite" options={{ title: 'Invite Agent' }} />
      <Stack.Screen name="sent" options={{ title: '', headerBackVisible: false }} />
    </Stack>
  );
}
