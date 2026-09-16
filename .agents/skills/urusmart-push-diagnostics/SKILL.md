---
name: urusmart-push-diagnostics
description: Diagnose and maintain remote push notifications in the URUSmart Expo app. Use when inbox notifications work but OS push does not, Expo reports zero accepted devices, token registration fails, or iOS/Android push credentials and builds need verification.
---

# URUSmart Push Diagnostics

Treat the backend inbox and remote push as separate delivery paths. A notification
appearing in the app only proves database persistence and `/notifications` sync;
it does not prove that the device token was registered or that Expo, APNs, or FCM
accepted the message.

## Project Facts

- Expo project: `@tharanon/uru-smart`
- EAS project ID: `84e1dc73-478a-47cd-ab3f-036c77153426`
- iOS bundle and Android package: `com.focusvc.urusmart`
- Client token flow: `onLoginSuccess()` ->
  `registerForPushNotificationsAsync()` -> `getExpoPushTokenAsync()` ->
  `POST /push-token` in `src/services/notificationService.js`.
- The app intentionally skips remote push in Expo Go and simulators. Test remote
  push on a physical device using a development, preview, or production build.
- `app.config.js` configures `expo-notifications`; Android also requires a valid
  `google-services.json` and an FCM V1 service-account key registered with EAS.
- A local Xcode build requires the Push Notifications capability and an
  `aps-environment` entitlement. A free Apple Personal Team cannot provide it.
- As verified on 2026-09-11, Android FCM V1 is configured in EAS with Firebase
  project `urusmart-9602e`. iOS still has no build credentials/Apple Push Key.
  Re-check before relying on this dated state because credentials are external
  and may change.
- As of 2026-09-11, the foreground handler sets `shouldShowBanner: true` and
  `shouldShowAlert: true`, so delivered notifications may display while the app
  is open.

## Diagnostic Order

Inspect each boundary and keep its evidence separate:

1. Confirm the target is a physical device and identify Expo Go, development,
   preview, or production build.
2. Confirm OS permission and capture sanitized client logs for permission,
   Expo token acquisition, and `/push-token` HTTP status. Never log the token or
   authorization header.
3. Confirm the backend has a current token for that authenticated user, with the
   expected platform and current Expo project ID. Old tokens from a prior EAS
   project or reinstalled app must be replaced.
4. Inspect the Expo push ticket response. `status: ok` means accepted for
   processing, not delivered. Record per-token errors such as
   `DeviceNotRegistered`, `MismatchSenderId`, or `InvalidCredentials`.
5. Fetch Expo push receipts using ticket IDs and preserve the per-device error.
6. Verify provider credentials: Apple Push Key for iOS and FCM V1 service-account
   key for Android. `google-services.json` alone is not a server credential.
7. If delivery succeeds only while backgrounded, inspect the foreground
   presentation policy in `src/services/notificationService.js`.
8. After credential or project changes, build and install a fresh binary, log in
   again to register a fresh token, remove stale backend tokens, then send to one
   device before testing groups.

## Useful Checks

Use `npx expo config --type public` to verify the resolved project ID, bundle ID,
package, notification plugin, and Google services path. Use `eas project:info`
to verify project linkage. Use `eas credentials -p ios` and
`eas credentials -p android` only for inspection unless the user explicitly
authorizes credential changes.

When the admin UI reports a result such as `Expo accepted 0/1`, require the raw
sanitized Expo ticket/receipt error from send history or backend logs before
changing application code. Do not infer delivery from the inbox row count.

## Change Boundaries

Do not modify credentials, revoke keys, delete device tokens, rebuild, commit,
or push unless the user authorizes that action. Preserve existing user changes
in the working tree. Prefer the smallest fix at the failed boundary and verify
with a single-device push before broader delivery.
