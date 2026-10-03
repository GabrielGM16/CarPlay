/**
 * Scrollable destinations keep every key reachable on short head-unit screens.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Key } from './Key';
import type { GlyphName } from './Glyph';
import { color, space } from '../theme';

export type Destination = 'dashboard' | 'now-playing' | 'library' | 'queue' | 'apps';

const DESTINATIONS: { id: Destination; icon: GlyphName; label: string }[] = [
  { id: 'dashboard', icon: 'split', label: 'Paneles' },
  { id: 'now-playing', icon: 'gauge', label: 'Música' },
  { id: 'library', icon: 'folder', label: 'Biblioteca' },
  { id: 'queue', icon: 'queue', label: 'Cola' },
  { id: 'apps', icon: 'apps', label: 'Apps' },
];

export function Rail({
  current,
  onSelect,
}: {
  current: Destination;
  onSelect: (destination: Destination) => void;
}) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.rail} showsVerticalScrollIndicator={false}>
      {DESTINATIONS.map((destination) => (
        <Key
          key={destination.id}
          variant="rail"
          icon={destination.icon}
          label={destination.label}
          active={current === destination.id}
          activeColor={color.dial}
          onPress={() => onSelect(destination.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0, backgroundColor: color.graphite, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.seam },
  rail: {
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
    gap: space.md,
    backgroundColor: color.graphite,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.seam,
    alignItems: 'center',
  },
});
