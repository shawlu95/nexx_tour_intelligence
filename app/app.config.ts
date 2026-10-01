import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAppDelegate, withEntitlementsPlist, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

// Base config lives in app.json. This file adds two things on top:
//
// 1. Scene-based life cycle (always). iOS 27 refuses to launch apps that haven't
//    adopted UIScene (crash in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
//    Expo SDK 57 ships ExpoAppSceneDelegate for this, but its project template doesn't
//    use it yet, so withSceneLifecycle wires it in on every prebuild.
//
// 2. Free-signing builds (NORA_FREE_SIGNING=1), for a free Apple ID ("Personal Team"),
//    which Apple doesn't allow to use push notifications or Sign in with Apple:
//
//      NORA_FREE_SIGNING=1 npx expo prebuild --platform ios --clean
//      NORA_FREE_SIGNING=1 npx expo run:ios --device
//
//    Expo applies the expo-notifications and expo-apple-authentication plugins
//    automatically whenever those packages are installed, so the entitlements they
//    add are removed here instead of by dropping the plugins.
//    The app reads `extra.freeSigning` to hide the Apple button and skip push.

const FREE_SIGNING_REMOVED_ENTITLEMENTS = ['aps-environment', 'com.apple.developer.applesignin'];

const withoutPaidEntitlements: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    for (const key of FREE_SIGNING_REMOVED_ENTITLEMENTS) delete mod.modResults[key];
    return mod;
  });

/**
 * Adopts the UIScene life cycle with Expo's ExpoAppSceneDelegate:
 * - Info.plist declares one window scene whose delegate is EXExpoAppSceneDelegate.
 * - AppDelegate conforms to ExpoReactNativeFactoryProvider and no longer creates the
 *   window itself; the scene delegate creates it and starts React Native in it.
 * Throws if the generated AppDelegate doesn't look as expected, so a template change
 * fails the prebuild instead of producing an app that crashes on launch.
 */
const withSceneLifecycle: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return mod;
  });

  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate');
    }
    let src = mod.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      const classDecl = 'class AppDelegate: ExpoAppDelegate {';
      if (!src.includes(classDecl)) throw new Error('withSceneLifecycle: AppDelegate class declaration not found');
      src = src.replace(classDecl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');

      // Drop the window creation + startReactNative block; ExpoAppSceneDelegate does it per scene.
      const startBlock = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
      if (!startBlock.test(src)) throw new Error('withSceneLifecycle: startReactNative block not found in AppDelegate');
      src = src.replace(
        startBlock,
        '\n    // The window and React Native start in ExpoAppSceneDelegate (scene life cycle, required on iOS 27).\n',
      );
    }
    mod.modResults.contents = src;
    return mod;
  });
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const freeSigning = process.env.NORA_FREE_SIGNING === '1';
  const base = config as ExpoConfig;
  if (!freeSigning) return withSceneLifecycle({ ...base, extra: { ...base.extra, freeSigning: false } });

  return withSceneLifecycle(
    withoutPaidEntitlements({
      ...base,
      ios: { ...base.ios, usesAppleSignIn: false },
      extra: { ...base.extra, freeSigning: true },
    }),
  );
};
