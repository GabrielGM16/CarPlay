import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { assignPanel, DEFAULT_DISPLAY, restoreDisplay, type DisplayPreferences, type MusicStyle, type PanelContent } from './preferences';

const KEY = 'display.preferences.v1';
interface DisplayValue extends DisplayPreferences {
  setCount: (count: DisplayPreferences['count']) => void;
  setMusicStyle: (style: MusicStyle) => void;
  setPanel: (index: number, content: PanelContent) => void;
  openWeb: (content: PanelContent) => void;
}
const Context = createContext<DisplayValue | null>(null);
export function useDisplay() {
  const value = useContext(Context);
  if (!value) throw new Error('DisplayProvider missing');
  return value;
}
export function DisplayProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_DISPLAY);
  const [loaded, setLoaded] = useState(false);
  const edited = useRef(false);
  const update = (change: (current: DisplayPreferences) => DisplayPreferences) => {
    edited.current = true;
    setPreferences(change);
  };
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(KEY).then((raw) => {
      if (!cancelled && !edited.current && raw) setPreferences(restoreDisplay(JSON.parse(raw)));
    }).catch(() => {}).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (loaded) void AsyncStorage.setItem(KEY, JSON.stringify(preferences)).catch(() => {});
  }, [loaded, preferences]);
  const value: DisplayValue = {
    ...preferences,
    setCount: (count) => update((current) => ({ ...current, count })),
    setMusicStyle: (musicStyle) => update((current) => ({ ...current, musicStyle })),
    setPanel: (index, content) => update((current) => ({ ...current, panels: assignPanel(current.panels, index, content) })),
    openWeb: (content) => update((current) => ({
      ...current, count: current.count === 1 ? 2 : current.count,
      panels: assignPanel(current.panels, 1, content),
    })),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
