/** Choose the permission that actually controls audio on this Android API. */
export function audioPermissionFor(apiLevel: number):
  'android.permission.READ_MEDIA_AUDIO' | 'android.permission.READ_EXTERNAL_STORAGE' {
  return apiLevel >= 33
    ? 'android.permission.READ_MEDIA_AUDIO'
    : 'android.permission.READ_EXTERNAL_STORAGE';
}
