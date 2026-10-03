/** Never hand app intents to Android while browsing an embedded panel. */
export function canNavigateInsidePanel(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}
