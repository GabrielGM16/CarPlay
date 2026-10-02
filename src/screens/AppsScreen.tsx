/**
 * The app grid.
 *
 * Tap opens an app over the top of us. Long press asks Android to open it
 * beside us instead — which works when the head unit already has us in
 * split-screen, and falls back to full-screen when it does not. The note at
 * the bottom of the screen says so plainly, because a control that sometimes
 * does something different needs to explain itself rather than seem broken.
 *
 * Icons are the real ones, pulled from each installed package, so the grid
 * looks like the device it is running on instead of like our idea of Spotify.
 */
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { Glyph } from '../components/Glyph';
import { Key } from '../components/Key';
import { SectionHeader, Seam } from '../components/Panel';
import {
  launchAdjacent,
  launchApp,
  openHomeAppSettings,
  resolveApps,
  type ResolvedApp,
} from '../launcher/apps';
import { color, radius, space, TOUCH, type } from '../theme';

const TILE = 132;

export function AppsScreen() {
  const [apps, setApps] = useState<ResolvedApp[] | null>(null);

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

  const installed = (apps ?? []).filter((app) => app.installed);

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Apps"
        meta={apps ? `${installed.length} installed` : undefined}
        action={
          <View style={styles.headerKeys}>
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

      {apps === null ? (
        <EmptyState
          icon="apps"
          title="Checking what is installed"
          detail="This takes a moment on first run."
        />
      ) : installed.length === 0 ? (
        <EmptyState
          icon="apps"
          title="No known apps found"
          detail="Install Maps, Spotify or Amazon Music and they will appear here."
          action={{ label: 'Look again', onPress: refresh }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {installed.map((app) => (
            <Pressable
              key={app.packageName}
              accessibilityRole="button"
              accessibilityLabel={app.label}
              accessibilityHint="Long press to open beside this app"
              onPress={() => void launchApp(app)}
              onLongPress={() => void launchAdjacent(app)}
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
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.note}>
        <Glyph name="split" size={18} color={color.faint} />
        <Text style={styles.noteText}>
          Long press to open an app beside this one. Android only tiles two apps
          once this one is already in split-screen, so put it there from Recents
          first — no app is allowed to do that step for you.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
