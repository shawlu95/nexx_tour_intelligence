import { Stack } from 'expo-router';
import { colors } from '../../../components/ui';

// Profile keeps its own stack so Privacy & data, the Privacy Policy and the Terms
// stay inside the tab (tab bar visible, Profile highlighted), as in the mockup.
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
