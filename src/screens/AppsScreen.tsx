/**
 * The app grid.
 *
 * Visible launch modes distinguish embedded web services, Android's adjacent
 * windows and full-screen apps. Full-screen handoff is an explicit choice.
 *
 * Icons are the real ones, pulled from each installed package, so the grid
 * looks like the device it is running on instead of like our idea of Spotify.
 */
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { Glyph } from '../components/Glyph';
import { Key } from '../components/Key';
import { SectionHeader, Seam } from '../components/Panel';
import {
  launchAdjacent,
  canLaunchAdjacent,
  launchApp,
  openHomeAppSettings,
  resolveApps,
  type ResolvedApp,
} from '../launcher/apps';
import { color, radius, space, TOUCH, type } from '../theme';
import type { PanelContent } from '../display/preferences';

const TILE = 132;

export function AppsScreen({ onOpenWeb, onDashboard }: { onOpenWeb: (content: PanelContent) => void; onDashboard: () => void }) {
  const [apps, setApps] = useState<ResolvedApp[] | null>(null);
  const [mode, setMode] = useState<'web' | 'adjacent' | 'fullscreen'>('web');

  const refresh = useCallback(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveApps();
      if (!cancelled) setApps(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const installed = (apps ?? []).filter((app) => app.installed);
  const available = (apps ?? []).filter((app) => app.installed || app.webPanel);
  const open = async (app: ResolvedApp) => {
    if (mode === 'web' && app.webPanel) { onOpenWeb(app.webPanel); return; }
    if (!app.installed) { Alert.alert('App no instalada', 'Instala la app o elige Dentro del launcher para usar su versión web.'); return; }
    if (mode !== 'fullscreen' && !canLaunchAdjacent()) {
      Alert.alert('Pantalla dividida de Android', 'En este Android primero abre Recientes y coloca Console en pantalla dividida. Después vuelve aquí y toca la app. También puedes elegir Pantalla completa.');
      return;
    }
    const opened = mode === 'fullscreen' ? await launchApp(app) : await launchAdjacent(app);
    if (!opened) Alert.alert('No se pudo abrir', `Android no pudo abrir ${app.label}. Comprueba que esté instalada y habilitada.`);
  };

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Apps"
        meta={apps ? `${installed.length} installed` : undefined}
        action={
          <View style={styles.headerKeys}>
            <Key variant="inline" icon="split" label="Abrir paneles" onPress={onDashboard} />
            <Key
              variant="inline"
              icon="refresh"
              label="Look for apps again"
              onPress={refresh}
            />
            <Key
              variant="inline"
              icon="gauge"
              label="Choose the home app"
              onPress={() => void openHomeAppSettings()}
            />
          </View>
        }
      />

      <Seam />
      <View style={styles.modes}>
        {([{ id: 'web', label: 'Dentro del launcher' }, { id: 'adjacent', label: 'Al lado · Android' }, { id: 'fullscreen', label: 'Pantalla completa' }] as const).map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: mode === option.id }} onPress={() => setMode(option.id)} style={[styles.mode, mode === option.id && styles.modeActive]}><Text style={styles.label}>{option.label}</Text></Pressable>)}
      </View>

      {apps === null ? (
        <EmptyState
          icon="apps"
          title="Checking what is installed"
          detail="This takes a moment on first run."
        />
      ) : available.length === 0 ? (
        <EmptyState
          icon="apps"
          title="No known apps found"
          detail="Install Maps, Spotify or Amazon Music and they will appear here."
          action={{ label: 'Look again', onPress: refresh }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {available.map((app) => (
            <Pressable
              key={app.packageName}
              accessibilityRole="button"
              accessibilityLabel={app.label}
              accessibilityHint={mode === 'web' && app.webPanel ? 'Abrir versión web dentro del launcher' : mode === 'fullscreen' ? 'Abrir a pantalla completa' : 'Solicitar pantalla dividida de Android'}
              onPress={() => void open(app)}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            >
              <View style={styles.iconWell}>
                {app.icon ? (
                  <Image
                    source={{ uri: app.icon }}
                    style={styles.icon}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Glyph name={app.glyph} size={34} color={color.dim} />
                )}
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {app.label}
              </Text>
              <Text style={styles.badge}>{mode === 'web' && app.webPanel ? 'Web en panel' : app.installed ? 'App Android' : 'Solo web'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.note}>
        <Glyph name="split" size={18} color={color.faint} />
        <Text style={styles.noteText}>
          Dentro del launcher usa versiones web cuando están disponibles; algunos servicios limitan el inicio de sesión o la reproducción. Las apps instaladas se abren al lado con Android: desde 12L puede dividir directamente; en versiones anteriores usa Recientes primero. La radio puede limitar la división a dos apps o abrirlas a pantalla completa.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  mode: { minHeight: 48, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: color.raised },
  modeActive: { backgroundColor: color.dialDeep },
  badge: { ...type.label, color: color.dial, fontSize: 12 },
  wrap: {
    flex: 1,
  },
  headerKeys: {
    flexDirection: 'row',
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg,
    padding: space.lg,
  },
  tile: {
    width: TILE,
    minHeight: TILE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderRadius: radius.panel,
    backgroundColor: color.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.seam,
  },
  pressed: {
    backgroundColor: '#1C2226',
    borderColor: color.seamLit,
  },
  iconWell: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 52,
    height: 52,
  },
  label: {
    ...type.label,
    color: color.illum,
    maxWidth: TILE - space.md * 2,
    textAlign: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.seam,
  },
  noteText: {
    ...type.label,
    color: color.dim,
    flex: 1,
    lineHeight: 19,
  },
});
