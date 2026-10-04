// Push notifications: tells the buyer when a note is ready if they left the screen.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { FREE_SIGNING } from './config';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Asks for permission (once) and saves this phone's push token on the profile. */
export async function registerForPush(userId: string): Promise<void> {
  if (!Device.isDevice || FREE_SIGNING) return;
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push notifications are off: no EAS project id in app config.');
    return;
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
}

/** Opens the note when the buyer taps a "note is ready" notification. */
export function listenForNotificationTaps(): () => void {
  const open = (data: unknown) => {
    const visitId = (data as { visitId?: string } | undefined)?.visitId;
    if (visitId) router.push(`/tour/note/${visitId}`);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last.notification.request.content.data);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
  return () => sub.remove();
}
