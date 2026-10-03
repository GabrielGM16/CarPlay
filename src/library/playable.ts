/**
 * Extensions we hand to the audio engine. MediaStore occasionally reports
 * ringtones and voice memos in containers the decoder will not open, and a
 * track that fails to load is worse than one that was never listed.
 */
const PLAYABLE = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'mp4',
  'm4b',
  'wma',
  'aiff',
  'aif',
  'mka',
]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  // A leading dot is a hidden name, not an extension.
  return dot <= 0 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function isPlayable(filename: string): boolean {
  return PLAYABLE.has(extensionOf(filename));
}
