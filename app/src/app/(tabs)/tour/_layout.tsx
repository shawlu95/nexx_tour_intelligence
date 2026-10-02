import { Stack } from 'expo-router';
import { colors } from '../../../components/ui';

// The Tour tab's own stack: Tour → finding the home → confirm → recording, with the
// tab bar and NORA header kept visible as in the mockup.
export default function TourLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
