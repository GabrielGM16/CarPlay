/**
 * The side rail: the app's four destinations, as fixed keys.
 *
 * A head unit has hard buttons down one side and this is their counterpart —
 * always in the same place, never scrolling, never hidden behind a menu. Four
 * is the whole app, so there is no overflow and no "more" key.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Key } from './Key';
import type { GlyphName } from './Glyph';
import { color, space } from '../theme';

export type Destination = 'now-playing' | 'library' | 'queue' | 'apps';

const DESTINATIONS: { id: Destination; icon: GlyphName; label: string }[] = [
  { id: 'now-playing', icon: 'gauge', label: 'Playing' },
  { id: 'library', icon: 'folder', label: 'Library' },
  { id: 'queue', icon: 'queue', label: 'Queue' },
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
    <View style={styles.rail}>
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
    </View>
  );
}

const styles = StyleSheet.create({
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
