/**
 * Now playing: the gauge, what it is playing, and what comes next.
 *
 * The gauge takes the left half and is sized from the available height so the
 * same layout works on a 600-point head unit and a 800-point tablet. Text is
 * left-aligned against it, which gives the eye one vertical edge to return to
 * — on a moving screen, centred text is work.
 */
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { usePlayer } from '../audio/PlayerProvider';
import { useSpectrum } from '../audio/useSpectrum';
import { upcomingTracks } from '../audio/queue';
import { EmptyState } from '../components/EmptyState';
import { Gauge } from '../components/Gauge';
import { color, space, type } from '../theme';

export interface NowPlayingScreenProps {
  /** Sends the user to the library when there is nothing loaded. */
  onBrowse: () => void;
}

export function NowPlayingScreen({ onBrowse }: NowPlayingScreenProps) {
  const player = usePlayer();
  const { height, width } = useWindowDimensions();

  const spectrum = useSpectrum(
    player.analyser,
    player.isPlaying,
    player.analyserEpoch
  );

  if (!player.track) {
    return (
      <EmptyState
        icon="note"
        title="Nothing loaded"
        detail="Pick a folder in the library and the gauge will come to life."
        action={{ label: 'Open library', onPress: onBrowse }}
      />
    );
  }

  const { track } = player;
  const next = upcomingTracks(player.queue)[0] ?? null;

  // Fit the dial to the shorter constraint, leaving room for the transport bar
  // below and the text column beside it.
  const gaugeSize = Math.min(height - 190, width * 0.42, 360);

  return (
    <View style={styles.wrap}>
      <Gauge
        size={gaugeSize}
        artwork={track.artwork}
        spectrum={spectrum}
        active={player.isPlaying}
      />

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {track.title}
        </Text>

        <Text style={styles.artist} numberOfLines={1}>
          {track.artist ?? 'Unknown artist'}
        </Text>

        {track.album ? (
          <Text style={styles.album} numberOfLines={1}>
            {track.album}
          </Text>
        ) : null}

        {next ? (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>Next</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {next.title}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.huge,
    paddingHorizontal: space.xl,
  },
  text: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    ...type.hero,
    color: color.illum,
  },
  artist: {
    ...type.subtitle,
    color: color.dial,
  },
  album: {
    ...type.body,
    color: color.dim,
  },
  next: {
    marginTop: space.xl,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.seam,
    gap: 2,
    // Keeps a long title from pushing the gauge off-centre on a narrow screen.
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  nextLabel: {
    ...type.label,
    color: color.dim,
  },
  nextTitle: {
    ...type.body,
    color: color.dim,
  },
});
