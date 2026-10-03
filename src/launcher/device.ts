import { requireOptionalNativeModule } from 'expo';

export interface AudioAsset {
  id: string;
  uri: string;
  filename: string;
  duration: number;
  creationTime: number;
}

export interface FileEntry {
  name: string;
  /** Absolute path, no trailing slash. */
  path: string;
  isDirectory: boolean;
  /** Bytes; 0 for directories. */
  size: number;
  /** Epoch ms. */
  modified: number;
}

/** FFT layout of the system visualizer, for mapping bins to bands. */
export interface VisualizerLayout {
  binCount: number;
  sampleRate: number;
}

interface Subscription {
  remove(): void;
}

/**
 * `null` when the APK predates the module. Functions added in later builds may
 * also be missing from an older APK, so callers check before calling them.
 */
export const device = requireOptionalNativeModule<{
  isInMultiWindow(): boolean;
  getAudioPage(afterId: number, limit: number): Promise<{
    assets: AudioAsset[];
    endCursor: string;
    hasNextPage: boolean;
  }>;
  hasAllFilesAccess?(): boolean;
  openAllFilesAccessSettings?(): boolean;
  getStorageRoots?(): string[];
  listDirectory?(path: string): Promise<FileEntry[]>;
  walkFiles?(path: string, limit: number): Promise<string[]>;
  scanPaths?(paths: string[]): Promise<number>;
  startVisualizer?(): Promise<VisualizerLayout | null>;
  stopVisualizer?(): Promise<void>;
  addListener?(
    event: 'onSpectrum',
    listener: (event: { bins: number[] }) => void
  ): Subscription;
}>('ConsoleDevice');
