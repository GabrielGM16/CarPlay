/**
 * Lets the app stand in as the head unit's home screen and share the screen
 * with other apps.
 *
 * Three manifest changes Expo does not make on its own:
 *   1. category HOME + DEFAULT on MainActivity, so Android offers this app in
 *      "Open by default -> Home app". Without it the app is just another icon.
 *   2. resizeableActivity, so Android will place us in a split-screen pair.
 *      A non-resizeable activity gets letterboxed instead of tiled.
 *   3. a <queries> block naming the apps on the launcher grid. On Android 11+
 *      package visibility is opt-in, so getApplicationIconAsync and
 *      "is it installed?" checks return nothing for packages we never declare.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/** Packages the launcher grid can show, probe, or hand off to. */
const VISIBLE_PACKAGES = [
  'com.google.android.apps.maps',
  'com.waze',
  'com.spotify.music',
  'com.amazon.mp3',
  'com.google.android.youtube',
  'com.google.android.apps.youtube.music',
  'com.android.settings',
  'com.google.android.deskclock',
  'com.android.chrome',
  'com.whatsapp',
  'org.telegram.messenger',
];

function withLauncherIntent(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const activity = (app.activity ?? []).find(
      (a) => a.$?.['android:name'] === '.MainActivity'
    );

    if (!activity) {
      throw new Error(
        'withCarLauncher: .MainActivity not found in AndroidManifest.xml'
      );
    }

    // Android tiles only activities that declare themselves resizeable.
    activity.$['android:resizeableActivity'] = 'true';
    // A home app must not stack copies of itself when HOME is pressed.
    activity.$['android:launchMode'] = 'singleTask';

    const filters = (activity['intent-filter'] ?? []);
    const launcherFilter = filters.find((f) =>
      (f.category ?? []).some(
        (c) => c.$?.['android:name'] === 'android.intent.category.LAUNCHER'
      )
    );

    if (launcherFilter) {
      const names = new Set(
        (launcherFilter.category ?? []).map((c) => c.$?.['android:name'])
      );
      launcherFilter.category = launcherFilter.category ?? [];
      for (const name of [
        'android.intent.category.HOME',
        'android.intent.category.DEFAULT',
      ]) {
        if (!names.has(name)) {
          launcherFilter.category.push({ $: { 'android:name': name } });
        }
      }
    }

    return cfg;
  });
}

function withPackageQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // `queries` sits beside `application`, not inside it.
    const existing = manifest.queries?.[0] ?? {};
    const declared = new Set(
      (existing.package ?? []).map((p) => p.$?.['android:name'])
    );

    const packages = [...(existing.package ?? [])];
    for (const name of VISIBLE_PACKAGES) {
      if (!declared.has(name)) {
        packages.push({ $: { 'android:name': name } });
      }
    }

    // Also let us resolve anything that answers a media/navigation intent, so
    // the grid still works for head units with vendor-specific apps.
    const intents = existing.intent ?? [
      {
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.LAUNCHER' } },
        ],
      },
    ];

    manifest.queries = [{ ...existing, package: packages, intent: intents }];
    return cfg;
  });
}

/**
 * Permissions other plugins add that this app has no business holding.
 *
 * expo-media-library hardcodes READ_MEDIA_VISUAL_USER_SELECTED even when it is
 * configured for audio only, and adds the legacy write permission. A music
 * player asking for access to your photos is exactly the prompt that makes
 * people tap Deny, so they are stripped here — this plugin runs last, after
 * every other plugin has had its say.
 */
const UNWANTED_PERMISSIONS = [
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

function withoutUnwantedPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const unwanted = new Set(UNWANTED_PERMISSIONS);

    manifest['uses-permission'] = (manifest['uses-permission'] ?? []).filter(
      (entry) => !unwanted.has(entry.$?.['android:name'])
    );

    return cfg;
  });
}

module.exports = function withCarLauncher(config) {
  // Applied in order; each wrapper sees the manifest the previous one left.
  return withoutUnwantedPermissions(withPackageQueries(withLauncherIntent(config)));
};
