import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist, type ConfigPlugin } from 'expo/config-plugins';

// Base config lives in app.json. This file only adjusts it for builds signed
// with a free Apple ID ("Personal Team"), which Apple doesn't allow to use push
// notifications or Sign in with Apple:
//
//   NORA_FREE_SIGNING=1 npx expo prebuild --platform ios --clean
//   NORA_FREE_SIGNING=1 npx expo run:ios --device
//
// Expo applies the expo-notifications and expo-apple-authentication plugins
// automatically whenever those packages are installed, so the entitlements they
// add are removed here instead of by dropping the plugins.
// The app reads `extra.freeSigning` to hide the Apple button and skip push.
const FREE_SIGNING_REMOVED_ENTITLEMENTS = ['aps-environment', 'com.apple.developer.applesignin'];

const withoutPaidEntitlements: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    for (const key of FREE_SIGNING_REMOVED_ENTITLEMENTS) delete mod.modResults[key];
    return mod;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const freeSigning = process.env.NORA_FREE_SIGNING === '1';
  const base = config as ExpoConfig;
  if (!freeSigning) return { ...base, extra: { ...base.extra, freeSigning: false } };

  return withoutPaidEntitlements({
    ...base,
    ios: { ...base.ios, usesAppleSignIn: false },
    extra: { ...base.extra, freeSigning: true },
  });
};
