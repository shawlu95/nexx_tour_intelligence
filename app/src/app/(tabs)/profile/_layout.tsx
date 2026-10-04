import { Stack } from 'expo-router';
import { nativeHeader } from '../../../components/ui';

// Profile's own stack, with the system navigation bar on pushed screens.
export default function ProfileLayout() {
  return (
    <Stack screenOptions={nativeHeader}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Profile' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy & Data' }} />
      <Stack.Screen name="privacy-policy" options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="terms" options={{ title: 'Terms' }} />
    </Stack>
  );
}
