/**
 * The transport bar: the controls that must be reachable from every screen.
 *
 * Laid out in three groups, left to right — modes, transport, position —
 * because that order never changes and muscle memory is the point. Play/pause
 * is the only bright face in the interface, and it is the largest key, so it
 * can be hit without looking.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DialSeekBar } from './DialSeekBar';
import { Key } from './Key';
import { usePlayer } from '../audio/PlayerProvider';
import { isEmpty } from '../audio/queue';
import { color, space } from '../theme';

export function TransportBar() {
  const player = usePlayer();
  const idle = isEmpty(player.queue);
  const [width, setWidth] = useState(1000);
  const compact = width < 640;
  const stacked = width < 460;

  const repeatIcon = player.repeat === 'one' ? 'repeat-one' : 'repeat';

  return (
    <View style={[styles.bar, compact && styles.compact, stacked && styles.stacked]} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      {!compact ? <View style={styles.group}>
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
      </View> : null}

      <View style={[styles.group, compact && styles.compactGroup]}>
        {compact ? <Key variant="inline" icon={repeatIcon} label="Opciones de reproducción" disabled={idle} onPress={() => Alert.alert('Reproducción', `Aleatorio: ${player.shuffle ? 'activado' : 'desactivado'} · Repetir: ${player.repeat === 'off' ? 'no' : player.repeat === 'all' ? 'cola' : 'canción'}`, [
          { text: 'Cambiar aleatorio', onPress: player.toggleShuffle },
          { text: 'Cambiar repetición', onPress: player.nextRepeatMode },
          { text: 'Cerrar', style: 'cancel' },
        ])} /> : null}
        <Key
          icon="previous"
          label="Previous track"
          onPress={player.previous}
          disabled={idle}
        />
        <Key
          variant={compact ? 'transport' : 'primary'}
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

      <View style={[styles.dial, stacked && styles.stackedDial]}>
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
  compact: { gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  compactGroup: { gap: 0, justifyContent: 'center' },
  stackedDial: { flex: 0, alignSelf: 'stretch' },
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
