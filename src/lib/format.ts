/** Small pure formatters shared across the UI. */

/**
 * Seconds to a clock reading: `0:07`, `3:58`, `1:02:03`.
 * Negative and non-finite inputs read as `0:00` rather than `NaN:NaN`.
 */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';

  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/**
 * Total runtime as a coarse reading for list headers: `48 min`, `2 h 14 min`.
 */
export function formatRuntime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0 min';

  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** `Bohemian Rhapsody.flac` -> `Bohemian Rhapsody`. */
export function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  // A leading dot is part of the name, not an extension.
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * Directory holding a `file:///a/b/song.mp3`, as `/a/b` with no trailing
 * slash. Returns `/` for a file at the filesystem root.
 */
export function folderOf(uri: string): string {
  const path = decodePath(uri);
  const slash = path.lastIndexOf('/');
  if (slash <= 0) return '/';
  return path.slice(0, slash);
}

/** Strips the `file://` scheme and percent-decodes a URI into a plain path. */
export function decodePath(uri: string): string {
  const withoutScheme = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURIComponent(withoutScheme);
  } catch {
    // Malformed escapes: better a readable raw path than an exception.
    return withoutScheme;
  }
}

/** Last segment of a path, e.g. `/storage/emulated/0/Music` -> `Music`. */
export function basename(path: string): string {
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1) || '/';
}

/**
 * Turns an Android storage path into something worth reading on screen.
 * `/storage/emulated/0/Music` is the user's own storage; anything else under
 * `/storage` is a card or a stick.
 */
export function prettyPath(path: string): string {
  if (path === '/storage/emulated/0' || path === '/sdcard') {
    return 'Internal storage';
  }
  const internal = path.match(/^\/storage\/emulated\/0\/(.*)$/);
  if (internal) return internal[1];

  const external = path.match(/^\/storage\/([^/]+)(?:\/(.*))?$/);
  if (external) {
    const volume = external[1];
    const rest = external[2];
    const label = /^[0-9A-F]{4}-[0-9A-F]{4}$/i.test(volume) ? 'SD card' : volume;
    return rest ? `${label}/${rest}` : label;
  }

  return path;
}

/** `3` -> `3 tracks`, `1` -> `1 track`. */
export function trackCount(count: number): string {
  return count === 1 ? '1 track' : `${count} tracks`;
}
