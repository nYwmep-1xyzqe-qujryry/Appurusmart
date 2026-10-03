// Storage keys and cleanup for push registration state.
//
// Kept separate from notificationService so session-clearing paths can import
// it without creating a cycle (sessionRequest -> notificationService -> api ->
// sessionRequest).
//
// The Expo token is written as soon as it is minted, before POST /push-token
// is attempted, so its presence is not proof of backend registration. The
// confirmation record is written only after the backend accepts, and the two
// are always cleared together.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";

export const CONFIRMED_SUFFIX = ":confirmed";

export const pushTokenKeyForUser = (userId) =>
  `${STORAGE_KEYS.PUSH_TOKEN}:user:${encodeURIComponent(String(userId))}`;

export const pushConfirmationKeyForUser = (userId) =>
  `${pushTokenKeyForUser(userId)}${CONFIRMED_SUFFIX}`;

// Scoped by userId so a second account on the same device keeps its own token
// and confirmation. A later login must confirm POST /push-token again.
export async function clearPushRegistrationForUser(userId) {
  if (userId == null || userId === "") return;
  try {
    await AsyncStorage.multiRemove([
      pushTokenKeyForUser(userId),
      pushConfirmationKeyForUser(userId),
    ]);
  } catch (_) {}
}
