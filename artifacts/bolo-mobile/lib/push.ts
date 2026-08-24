// Server push registration: fetching this device's Expo token and telling the
// server about it.
//
// DISTINCT FROM lib/reminders.ts, which schedules the DAILY practice reminder
// on the device itself and needs no server, no token and no network. This file
// is only for messages the server originates, where it has to reach a phone
// that is not running the app. The two share exactly one thing, the OS
// notification permission, and asking for it twice is the bug this file is
// written to avoid.
//
// WHY THIS EXISTS NOW. The push_tokens table, POST /push/register and the Expo
// sender have all been in the codebase for a while with nothing between them:
// production held ZERO tokens and no code path could produce one, because
// nothing ever called getExpoPushTokenAsync. This is the missing middle.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  registerPushToken,
  unregisterPushToken,
} from '@workspace/api-client-react';
import { remindersSupported } from '@/lib/reminders';

/** The token last handed to the server, so an unchanged one is not re-sent. */
const LAST_SENT_KEY = 'bolo.push-token.v1';

/**
 * Expo needs the EAS project id to mint a token in a production build.
 *
 * Read from the manifest rather than hardcoded: it lives in app.json under
 * extra.eas.projectId, and a copy here would be a second place to be wrong.
 * Absent in Expo Go and in some dev configurations, where token minting is not
 * available anyway.
 */
function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId;
}

/** "ios" or "android"; anything else cannot receive a push. */
function pushPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Fetch this device's Expo push token and register it with the server.
 *
 * NEVER ASKS FOR PERMISSION. It reads the current grant and gives up quietly if
 * there is not one. The single permission prompt belongs to the reminders
 * screen, which is where the learner is deciding about notifications; a second
 * prompt fired from a background code path is how an app burns its one chance
 * at that dialog on iOS, where a denial is close to permanent.
 *
 * SAFE AND SILENT TO CALL ON EVERY LAUNCH. It short-circuits when nothing has
 * changed, and every failure path returns false rather than throwing: a push
 * token is not worth interrupting a learner over.
 */
export async function syncPushToken(): Promise<boolean> {
  if (!remindersSupported) return false;
  const platform = pushPlatform();
  if (!platform) return false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return false;

    const projectId = easProjectId();
    if (!projectId) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (!token) return false;

    // Expo rotates a token whenever it feels like it and gives no event when it
    // does, so this runs on every launch. Sending an unchanged token every time
    // would be a pointless write on the server's unique index.
    const lastSent = await AsyncStorage.getItem(LAST_SENT_KEY);
    if (lastSent === token) return true;

    await registerPushToken({ token, platform });
    await AsyncStorage.setItem(LAST_SENT_KEY, token);
    return true;
  } catch {
    // A device that cannot be reached is a missed notification, not an error
    // worth surfacing. Deliberately silent.
    return false;
  }
}

/**
 * Retire this device's token, so the server can no longer reach it.
 *
 * THIS IS HOW THE PREFERENCE IS ENFORCED. Turning streak reminders off does not
 * set a server flag, it removes the address: a server with no token for a
 * device cannot deliver to it, whatever it decides to send. That is why this
 * preference needs no schema change, and it is only sufficient while there is
 * exactly ONE push message type. A second one needs server-side preferences.
 */
export async function retirePushToken(): Promise<void> {
  try {
    const lastSent = await AsyncStorage.getItem(LAST_SENT_KEY);
    if (!lastSent) return;
    await unregisterPushToken({ token: lastSent });
    await AsyncStorage.removeItem(LAST_SENT_KEY);
  } catch {
    // Best effort. The local record is cleared only on success, so a failed
    // retire is retried the next time the learner touches the setting.
  }
}
