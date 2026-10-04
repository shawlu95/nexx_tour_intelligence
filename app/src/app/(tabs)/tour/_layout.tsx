import { Stack } from 'expo-router';
import { nativeHeader } from '../../../components/ui';

// The Tour tab's own stack. Pushed screens use the system navigation bar (back
// button, swipe back); recording and typing cover the whole screen.
export default function TourLayout() {
  return (
    <Stack screenOptions={nativeHeader}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Tour' }} />
      <Stack.Screen name="locate" options={{ title: 'Record a Home' }} />
      <Stack.Screen name="pick" options={{ title: 'Change Location' }} />
      <Stack.Screen name="record" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="type" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="note/[id]" options={{ title: 'Note' }} />
      <Stack.Screen name="home/[id]" options={{ title: '' }} />
    </Stack>
  );
}
