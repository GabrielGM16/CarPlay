/**
 * The transport bar: the controls that must be reachable from every screen.
 *
 * Laid out in three groups, left to right — modes, transport, position —
 * because that order never changes and muscle memory is the point. Play/pause
 * is the only bright face in the interface, and it is the largest key, so it
 * can be hit without looking.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { DialSeekBar } from './DialSeekBar';
import { Key } from './Key';
import { usePlayer } from '../audio/PlayerProvider';
import { isEmpty } from '../audio/queue';
import { color, space } from '../theme';

export function TransportBar() {
  const player = usePlayer();
  const idle = isEmpty(player.queue);

  const repeatIcon = player.repeat === 'one' ? 'repeat-one' : 'repeat';

  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        <Key
          icon="shuffle"
          label="Shuffle"
          onPress={player.toggleShuffle}
          active={player.shuffle}
          disabled={idle}
        />
        <Key
          icon={repeatIcon}
          label={
            player.repeat === 'one'
              ? 'Repeat this track'
              : player.repeat === 'all'
                ? 'Repeat the queue'
                : 'Repeat off'
          }
          onPress={player.nextRepeatMode}
          active={player.repeat !== 'off'}
          disabled={idle}
        />
      </View>

      <View style={styles.group}>
        <Key
          icon="previous"
          label="Previous track"
          onPress={player.previous}
          disabled={idle}
        />
        <Key
          variant="primary"
          icon={player.isPlaying ? 'pause' : 'play'}
          label={player.isPlaying ? 'Pause' : 'Play'}
          onPress={player.toggle}
          disabled={idle}
        />
        <Key
          icon="next"
          label="Next track"
          onPress={player.next}
          disabled={idle}
        />
      </View>

      <View style={styles.dial}>
        <DialSeekBar
          position={player.position}
          duration={player.duration}
          elapsed={player.elapsed}
          isPlaying={player.isPlaying}
          onSeek={player.seekTo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.graphite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.seam,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dial: {
    flex: 1,
  },
});
