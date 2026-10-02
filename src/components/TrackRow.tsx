/**
 * One track in a list.
 *
 * Sized for a car, not a phone: the whole row is the target, it is `TOUCH`
 * tall, and the only secondary control is a single wide key. A row that is
 * playing is marked by a lit left edge rather than a filled background, so the
 * list stays quiet while still being readable at a glance.
 */
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph } from './Glyph';
import { Key } from './Key';
import { formatTime } from '../lib/format';
import { color, radius, space, TOUCH, type } from '../theme';
import type { Track } from '../types';

export interface TrackRowProps {
  track: Track;
  onPress: () => void;
  /** Trailing key. Omit for a list where a secondary action makes no sense. */
  action?: {
    icon: 'plus' | 'play-next' | 'remove';
    label: string;
    onPress: () => void;
  };
  /** This track is the one loaded in the player. */
  playing?: boolean;
  /** Position shown at the left, for a numbered queue. */
  ordinal?: number;
}

export const TrackRow = React.memo(function TrackRow({
  track,
  onPress,
  action,
  playing = false,
  ordinal,
}: TrackRowProps) {
  // Artist only. The album is already implied by the folder you are browsing,
  // and stacking both here just crowds the row.
  const subtitle = track.artist;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.title}`}
      accessibilityState={{ selected: playing }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {/* Lit edge: the marker for the track currently loaded. */}
      <View style={[styles.edge, playing && styles.edgeLit]} />

      {ordinal !== undefined ? (
        <Text style={[styles.ordinal, playing && styles.ordinalPlaying]}>
          {ordinal}
        </Text>
      ) : null}

      <View style={styles.thumb}>
        {track.artwork ? (
          <Image
            source={{ uri: track.artwork }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={140}
          />
        ) : (
          <Glyph name="note" size={20} color={color.faint} />
        )}
      </View>

      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.title, playing && styles.titlePlaying]}
        >
          {track.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Text style={styles.duration}>
        {track.duration > 0 ? formatTime(track.duration) : '--:--'}
      </Text>

      {action ? (
        <Key
          variant="inline"
          icon={action.icon}
          label={action.label}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    paddingRight: space.md,
    paddingLeft: space.md,
    gap: space.md,
  },
  pressed: {
    backgroundColor: color.raised,
  },
  edge: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  edgeLit: {
    backgroundColor: color.dial,
  },
  ordinal: {
    ...type.numeral,
    color: color.faint,
    width: 26,
    textAlign: 'right',
  },
  ordinalPlaying: {
    color: color.dial,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.row,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...type.bodyMedium,
    color: color.illum,
  },
  titlePlaying: {
    color: color.dial,
  },
  subtitle: {
    ...type.label,
    color: color.dim,
  },
  duration: {
    ...type.numeral,
    color: color.dim,
  },
  action: {
    marginLeft: space.xs,
  },
});
