export const PANEL_CONTENT = ['now-playing', 'library', 'queue', 'youtube', 'youtube-music', 'maps'] as const;
export type PanelContent = typeof PANEL_CONTENT[number];
export type MusicStyle = 'dial' | 'cover' | 'ambient';
export interface DisplayPreferences {
  count: 1 | 2 | 3 | 4;
  musicStyle: MusicStyle;
  panels: PanelContent[];
}
export const DEFAULT_DISPLAY: DisplayPreferences = {
  count: 2, musicStyle: 'dial', panels: ['now-playing', 'library', 'queue', 'youtube'],
};

export function restoreDisplay(value: unknown): DisplayPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DISPLAY, panels: [...DEFAULT_DISPLAY.panels] };
  const saved = value as Partial<DisplayPreferences>;
  const chosen: PanelContent[] = [];
  const storedPanels = Array.isArray(saved.panels) ? saved.panels : [];
  DEFAULT_DISPLAY.panels.forEach((fallback, index) => {
    const content = storedPanels[index];
    chosen.push(PANEL_CONTENT.includes(content) && !chosen.includes(content)
      ? content
      : !chosen.includes(fallback) ? fallback : PANEL_CONTENT.find((item) => !chosen.includes(item))!);
  });
  return {
    count: [1, 2, 3, 4].includes(saved.count ?? 0) ? saved.count! : 2,
    musicStyle: ['dial', 'cover', 'ambient'].includes(saved.musicStyle ?? '') ? saved.musicStyle! : 'dial',
    panels: chosen,
  };
}

/** Keep the sole music visualizer in one panel; selecting it elsewhere swaps. */
export function assignPanel(panels: PanelContent[], index: number, content: PanelContent): PanelContent[] {
  if (!Number.isInteger(index) || index < 0 || index >= panels.length) return panels;
  const next = [...panels];
  const existing = panels.indexOf(content);
  if (existing !== -1 && existing !== index) next[existing] = panels[index];
  next[index] = content;
  return next;
}
