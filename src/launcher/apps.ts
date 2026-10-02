/**
 * Launching the other apps on the head unit.
 *
 * What Android actually allows, and what it does not:
 *
 *   Launching works everywhere. An intent with `ACTION_MAIN` plus the
 *   `LAUNCHER` category starts any installed app.
 *
 *   Embedding another app inside our own UI is impossible, by design. No API
 *   exists for it at any permission level, so "Spotify in the right-hand pane"
 *   is not a thing an app can build — only the system can compose two apps.
 *
 *   Side-by-side uses the system's own split-screen. `FLAG_ACTIVITY_LAUNCH_
 *   ADJACENT` asks Android to place the target beside us rather than over us,
 *   but since Android 10 it only takes effect when the caller is *already* in
 *   split-screen mode. Nothing an unprivileged app can call will enter that
 *   mode: `setLaunchWindowingMode` is system-only, and the one public route is
 *   `GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN`, which needs an accessibility service
 *   the user switches on by hand.
 *
 *   So `launchAdjacent` is exactly as good as it can be: beside us when we are
 *   already tiled, full-screen otherwise. The flag is harmless in the second
 *   case, which is why it is always set rather than probed for.
 *
 * Package visibility is the other Android-11 wrinkle: every package here has
 * to be declared in the manifest's `<queries>` block or it is invisible to us
 * even when installed. See `plugins/withCarLauncher.js`.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import type { GlyphName } from '../components/Glyph';

/** `Intent.FLAG_ACTIVITY_NEW_TASK` — required to start another app's task. */
const FLAG_NEW_TASK = 0x10000000;

/** `Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT` — place beside the caller. */
const FLAG_LAUNCH_ADJACENT = 0x00001000;

/** `Intent.FLAG_ACTIVITY_MULTIPLE_TASK` — pair with ADJACENT for a new pane. */
const FLAG_MULTIPLE_TASK = 0x08000000;

const CATEGORY_LAUNCHER = 'android.intent.category.LAUNCHER';

export interface AppEntry {
  /** Stable key, also the Android package name. */
  packageName: string;
  label: string;
  /** Fallback mark shown until the real icon resolves, or if it never does. */
  glyph: GlyphName;
  /**
   * A deep link preferred over a plain launch — `google.navigation:` starts
   * Maps in navigation mode rather than dropping you on the map.
   */
  deepLink?: string;
}

/**
 * The grid, in the order a driver reaches for them: navigation first, then
 * the music services, then the rest.
 */
export const CATALOG: AppEntry[] = [
  {
    packageName: 'com.google.android.apps.maps',
    label: 'Maps',
    glyph: 'split',
  },
  { packageName: 'com.waze', label: 'Waze', glyph: 'split' },
  { packageName: 'com.spotify.music', label: 'Spotify', glyph: 'note' },
  { packageName: 'com.amazon.mp3', label: 'Amazon Music', glyph: 'note' },
  {
    packageName: 'com.google.android.apps.youtube.music',
    label: 'YouTube Music',
    glyph: 'note',
  },
  { packageName: 'com.android.chrome', label: 'Browser', glyph: 'forward' },
  { packageName: 'com.google.android.deskclock', label: 'Clock', glyph: 'gauge' },
  { packageName: 'com.android.settings', label: 'Settings', glyph: 'apps' },
];

export interface ResolvedApp extends AppEntry {
  /** `data:image/png;base64,…`, ready for an `Image` source. */
  icon: string | null;
  installed: boolean;
}

/**
 * Resolves which catalog entries are present and grabs their real icons.
 *
 * `getApplicationIconAsync` doubles as the installed check: it rejects for a
 * package that is absent or not visible to us.
 */
export async function resolveApps(
  catalog: AppEntry[] = CATALOG
): Promise<ResolvedApp[]> {
  if (Platform.OS !== 'android') {
    return catalog.map((entry) => ({ ...entry, icon: null, installed: false }));
  }

  return Promise.all(
    catalog.map(async (entry): Promise<ResolvedApp> => {
      try {
        const icon = await IntentLauncher.getApplicationIconAsync(
          entry.packageName
        );
        return { ...entry, icon, installed: true };
      } catch {
        return { ...entry, icon: null, installed: false };
      }
    })
  );
}

/** Starts an app over the top of us, the ordinary launcher behaviour. */
export async function launchApp(app: AppEntry): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  if (app.deepLink) {
    try {
      if (await Linking.canOpenURL(app.deepLink)) {
        await Linking.openURL(app.deepLink);
        return true;
      }
    } catch {
      // Fall through to the plain launch below.
    }
  }

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      packageName: app.packageName,
      category: CATEGORY_LAUNCHER,
      flags: FLAG_NEW_TASK,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts an app beside us when we are already in split-screen, and over us
 * when we are not. See the note at the top of this file for why there is no
 * way to guarantee the first case.
 */
export async function launchAdjacent(app: AppEntry): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
      packageName: app.packageName,
      category: CATEGORY_LAUNCHER,
      flags: FLAG_NEW_TASK | FLAG_LAUNCH_ADJACENT | FLAG_MULTIPLE_TASK,
    });
    return true;
  } catch {
    // MULTIPLE_TASK upsets some single-instance activities; retry without it.
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: app.packageName,
        category: CATEGORY_LAUNCHER,
        flags: FLAG_NEW_TASK | FLAG_LAUNCH_ADJACENT,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Opens Android's "Home app" picker, so this app can be made the head unit's
 * launcher. There is no API to set it directly — the choice is the user's.
 */
export async function openHomeAppSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.HOME_SETTINGS',
      {}
    );
  } catch {
    // Some head-unit ROMs strip that screen; the app-details page is next best.
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.APPLICATION_DETAILS_SETTINGS',
        { data: 'package:com.gmofi.console' }
      );
    } catch {
      // Nothing further to try.
    }
  }
}

/** Starts turn-by-turn navigation to a destination in Maps. */
export async function navigateTo(destination: string): Promise<boolean> {
  const url = `google.navigation:q=${encodeURIComponent(destination)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
