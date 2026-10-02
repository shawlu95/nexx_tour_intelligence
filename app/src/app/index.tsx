import { Redirect } from 'expo-router';

// The app opens on the Tour tab.
export default function Index() {
  return <Redirect href="/tour" />;
}
