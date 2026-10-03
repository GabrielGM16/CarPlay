/**
 * The queue, in the order it will actually play.
 *
 * With shuffle on, that is not the order things were added — which is the
 * whole point of showing it. Reordering is one long press rather than a drag:
 * dragging a row while the car is moving is not a gesture anyone completes.
 */
import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { usePlayer } from '../audio/PlayerProvider';
import { orderedTracks, totalDuration } from '../audio/queue';
import { EmptyState } from '../components/EmptyState';
import { Key } from '../components/Key';
import { SectionHeader, Seam } from '../components/Panel';
import { TrackRow } from '../components/TrackRow';
import { formatRuntime, trackCount } from '../lib/format';
import { color, space, type } from '../theme';

export interface QueueScreenProps {
  onBrowse: () => void;
  compact?: boolean;
}

export function QueueScreen({ onBrowse, compact = false }: QueueScreenProps) {
  const player = usePlayer();

  const tracks = useMemo(() => orderedTracks(player.queue), [player.queue]);
  const { position } = player.queue;

  const renderRow = useCallback(
    ({ item, index }: { item: (typeof tracks)[number]; index: number }) => (
      <TrackRow
        track={item}
        ordinal={index + 1}
        playing={index === position}
        onPress={() => player.jumpToQueueSlot(index)}
        action={{
          icon: 'remove',
          label: `Remove ${item.title} from the queue`,
          onPress: () => player.removeQueueSlot(index),
        }}
      />
    ),
    [player, position]
  );

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon="queue"
        title="The queue is empty"
        detail="Play a folder from the library and everything in it lands here."
        action={{ label: 'Open library', onPress: onBrowse }}
      />
    );
  }

  const remaining = tracks.length - position - 1;

  return (
    <View style={styles.wrap}>
      {!compact ? <SectionHeader
        title="Playing next"
        meta={`${trackCount(tracks.length)} · ${formatRuntime(
          totalDuration(player.queue)
        )}`}
        action={
          <Key
            variant="inline"
            icon="close"
            label="Clear everything after the current track"
            onPress={player.clearQueue}
            disabled={remaining === 0}
          />
        }
      /> : null}

      <Seam />

      <FlatList
        data={tracks}
        keyExtractor={(track, index) => `${index}:${track.id}`}
        renderItem={renderRow}
        ItemSeparatorComponent={Seam}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.list}
      />

      {!compact ? <Text style={styles.hint}>
        {remaining > 0
          ? `${trackCount(remaining)} still to come`
          : 'Last track in the queue'}
      </Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  list: {
    paddingBottom: space.lg,
  },
  hint: {
    ...type.label,
    color: color.dim,
    textAlign: 'center',
    paddingVertical: space.sm,
  },
});
