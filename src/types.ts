/** A playable audio file on the device, plus whatever tags we could read. */
export interface Track {
  /** MediaLibrary asset id. Stable across scans, so it keys the queue. */
  id: string;
  /** `file://…` URI handed to the audio engine. */
  uri: string;
  /** Filename including extension. */
  filename: string;
  /** Absolute directory holding the file, without trailing slash. */
  folder: string;
  /** Seconds. MediaLibrary reports this; 0 when it could not. */
  duration: number;
  /** Epoch ms, used for "recently added". */
  addedAt: number;

  /** ID3 title, or the filename with its extension stripped. */
  title: string;
  /** ID3 artist. `null` until tags are read, and when the file has none. */
  artist: string | null;
  /** ID3 album. */
  album: string | null;
  /** Embedded cover art as a data URI, cached on disk. */
  artwork: string | null;
  /** Whether we have already attempted to read tags for this file. */
  tagged: boolean;
}

/** Off, repeat the whole queue, or repeat the current track. */
export type RepeatMode = 'off' | 'all' | 'one';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'buffering';

/** A directory in the library tree, derived from the scanned file paths. */
export interface FolderNode {
  /** Absolute path, without trailing slash. Also the node key. */
  path: string;
  /** Last path segment, or the storage label at the root. */
  name: string;
  /** Immediate subdirectories, sorted by name. */
  children: FolderNode[];
  /** Tracks directly in this folder, sorted by filename. */
  tracks: Track[];
  /** Tracks in this folder and everything under it. */
  totalTracks: number;
}
