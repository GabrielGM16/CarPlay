# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Gotchas already paid for in this project

Each of these cost a failed build or a wrong-looking result. They are not
guessable from the docs index.

- **Config-plugin mods run in reverse registration order.** A mod registered
  later wraps the earlier one and therefore runs *first*. `withCarLauncher` is
  declared **first** in `app.json` precisely so its manifest mod runs **last** —
  it strips permissions that `expo-media-library` adds, and stripping them
  before that plugin runs does nothing. If you reorder `plugins`, re-check
  `android/app/src/main/AndroidManifest.xml`.

- **`babel-preset-expo` adds the worklets plugin itself** when
  `react-native-worklets` is installed. Do not also list
  `react-native-worklets/plugin` in `babel.config.js`; that applies the
  transform twice.

- **`babel-preset-expo` must be a direct dependency** once a
  `babel.config.js` exists. It ships nested under `expo/node_modules`, so
  Metro cannot resolve it by name from the project root without an explicit
  install.

- **Import Google fonts per weight**, e.g.
  `@expo-google-fonts/barlow/400Regular`. The package root re-exports all
  eighteen weights and Metro bundles every `.ttf` it can reach — that was
  ~1.9 MB of unused fonts in the APK.

- **`expo-media-library` audio lives in the legacy entry point.**
  `import * as MediaLibrary from 'expo-media-library/legacy'` for
  `getAssetsAsync({ mediaType: [MediaType.audio] })`. It reports filename and
  duration but **not** artist, album or cover art for audio — that is why
  `src/lib/id3.ts` exists.

- **`FileMode.ReadOnly`, not `FileMode.Read`.** And
  `StyleSheet.absoluteFillObject` is gone from the RN 0.86 types; write the
  four offsets out, since `absoluteFill` is a registered style id and cannot
  be spread.

- **`react-native-audio-api` ships FFmpeg by default** (`disableFFmpeg:
  false`). Streaming via `<Audio>`, remote metadata and most non-WAV decode
  paths depend on it, so do not disable it to shrink the APK without checking
  `isFfmpegEnabled()` against what the player needs.

- **Audio memory is the reason for the architecture.** Playback streams
  through `<Audio>` + `MediaElementAudioSourceNode`. Decoding to `AudioBuffer`
  instead would cost ~84 MB per four-minute track. Keep the analyser tapped
  off the media element.

## Tests

`npm test` runs `node --test` with Node 24's native type stripping — no Jest,
no build step. Two constraints follow from that:

- Test files import with an explicit `.ts` extension, which is why
  `src/**/__tests__/**` is excluded from `tsconfig.json`.
- Source files use extensionless relative imports (as Metro expects), so
  `scripts/ts-resolve.mjs` registers a resolve hook that tries `.ts`, `.tsx`
  and `/index`. It must not set `format`, or Node skips type stripping.

Keep logic that can be wrong in silence — tag parsing, queue and shuffle
rules, band mapping — in pure modules with tests, and keep IO in the
providers. That split is the point, not an accident.
