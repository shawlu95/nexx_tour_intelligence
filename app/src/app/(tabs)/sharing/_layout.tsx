import { Stack } from 'expo-router';
import { colors } from '../../../components/ui';

// Sharing keeps its own stack so Invite and Invitation sent stay inside the tab
// (tab bar visible, Sharing highlighted), as in the mockup.
export default function SharingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
