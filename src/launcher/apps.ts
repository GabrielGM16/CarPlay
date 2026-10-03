/**
 * Launching the other apps on the head unit.
 *
 * What Android actually allows, and what it does not:
 *
 *   Launching works everywhere. An intent with `ACTION_MAIN` plus the
 *   `LAUNCHER` category starts any installed app.
 *
 *   Installed apps use Android's own windows. Services with a web version
 *   can instead be displayed by WebPanel inside the launcher's dashboard.
 *
 *   Side-by-side uses the system's own split-screen. `FLAG_ACTIVITY_LAUNCH_
 *   ADJACENT` asks Android to place the target beside us rather than over us,
 *   Android 12L (API 32) and later can enter split-screen from full-screen.
 *   Earlier versions need the caller to be in multi-window first. OEMs and
 *   target activities can still prevent tiling; four native windows are not
 *   guaranteed by this API.
 *
 *   Check the current window mode on older Android before requesting a split.
 *
 * Package visibility is the other Android-11 wrinkle: every package here has
 * to be declared in the manifest's `<queries>` block or it is invisible to us
 * even when installed. See `plugins/withCarLauncher.js`.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import type { GlyphName } from '../components/Glyph';
import type { PanelContent } from '../display/preferences';
import { device } from './device';

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
  webPanel?: PanelContent;
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
    webPanel: 'maps',
  },
  { packageName: 'com.waze', label: 'Waze', glyph: 'split' },
  { packageName: 'com.spotify.music', label: 'Spotify', glyph: 'note' },
  { packageName: 'com.amazon.mp3', label: 'Amazon Music', glyph: 'note' },
  { packageName: 'com.google.android.youtube', label: 'YouTube', glyph: 'note', webPanel: 'youtube' },
  {
    packageName: 'com.google.android.apps.youtube.music',
    label: 'YouTube Music',
    glyph: 'note',
    webPanel: 'youtube-music',
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
 * Requests Android's adjacent window. OEM support and target resizability
 * determine the actual placement even when the intent succeeds.
 */
export async function launchAdjacent(app: AppEntry): Promise<boolean> {
  if (!canLaunchAdjacent()) return false;

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

export function canLaunchAdjacent(): boolean {
  return Platform.OS === 'android' &&
    (Number(Platform.Version) >= 32 || (device?.isInMultiWindow() ?? false));
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
