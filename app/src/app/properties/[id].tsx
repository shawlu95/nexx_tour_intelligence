// Older links open homes here; home pages now live in the Tour tab.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function PropertyRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/tour/home/${id}`} />;
}
