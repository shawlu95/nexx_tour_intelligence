// Haptic feedback in the places iOS apps use it: selection changes, drag, success
// and warnings. Never throws (simulators and some devices have no haptics).
import * as Haptics from 'expo-haptics';

const quiet = (p: Promise<void>) => void p.catch(() => undefined);

/** A choice changed (tab, Voice/Type, an answer). */
export const tapSelection = () => quiet(Haptics.selectionAsync());

/** Something started or was picked up (recording, drag). */
export const tapImpact = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => quiet(Haptics.impactAsync(style));

/** A task finished well (note ready, saved). */
export const tapSuccess = () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Before or after something destructive. */
export const tapWarning = () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

export { ImpactFeedbackStyle } from 'expo-haptics';
