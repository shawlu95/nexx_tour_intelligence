// Older links (notifications, earlier builds) open notes here; notes now live in the Tour tab.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VisitRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/tour/note/${id}`} />;
}
