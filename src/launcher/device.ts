import { requireOptionalNativeModule } from 'expo';

export interface AudioAsset {
  id: string;
  uri: string;
  filename: string;
  duration: number;
  creationTime: number;
}

export const device = requireOptionalNativeModule<{
  isInMultiWindow(): boolean;
  getAudioPage(afterId: number, limit: number): Promise<{
    assets: AudioAsset[];
    endCursor: string;
    hasNextPage: boolean;
  }>;
}>('ConsoleDevice');
