/**
 * The file explorer.
 *
 * Folders come from the scanned file paths rather than from walking the disk,
 * which is what makes browsing reliable under Android's scoped storage — we
 * already know where every audio file is, so the hierarchy is derived instead
 * of discovered.
 *
 * Each folder offers two ways in: tap the row to open it, or tap the key to
 * play everything under it. That second one is the request a driver actually
 * has, and making them open a folder first to get at it would be wrong.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlayer } from '../audio/PlayerProvider';
import { EmptyState } from '../components/EmptyState';
import { Glyph } from '../components/Glyph';
import { Key } from '../components/Key';
import { SectionHeader, Seam } from '../components/Panel';
import { TrackRow } from '../components/TrackRow';
import { useLibrary } from '../library/LibraryProvider';
import { collectTracks, findFolder, pathToFolder } from '../library/tree';
import { formatRuntime, prettyPath, trackCount } from '../lib/format';
import { color, radius, space, TOUCH, type } from '../theme';
import type { FolderNode, Track } from '../types';

/** One entry in the flattened list: a subfolder, or a track in this folder. */
type Row =
  | { kind: 'folder'; folder: FolderNode }
  | { kind: 'track'; track: Track; index: number };

function openPermissionSettings() {
  void Linking.openSettings().catch(() => Alert.alert('Ajustes', 'Abre Ajustes → Apps → Console → Permisos.'));
}

export function LibraryScreen({ compact = false }: { compact?: boolean }) {
  const library = useLibrary();
  const player = usePlayer();

  /** `null` means "the tree root", which survives a rescan changing its path. */
  const [openPath, setOpenPath] = useState<string | null>(null);

  const folder = useMemo(() => {
    if (!library.tree) return null;
    if (openPath === null) return library.tree;
    // A rescan can remove the folder we were in; fall back to the root.
    return findFolder(library.tree, openPath) ?? library.tree;
  }, [library.tree, openPath]);

  const crumbs = useMemo(
    () => (folder ? pathToFolder(library.tree, folder.path) : []),
    [library.tree, folder]
  );

  /** Tracks in this folder, in the order shown — what a tap enqueues. */
  const ownTracks = folder?.tracks ?? [];

  const rows = useMemo<Row[]>(() => {
    if (!folder) return [];
    return [
      ...folder.children.map((child): Row => ({ kind: 'folder', folder: child })),
      ...folder.tracks.map(
        (track, index): Row => ({ kind: 'track', track, index })
      ),
    ];
  }, [folder]);

  const playFolder = useCallback(
    (node: FolderNode, shuffle: boolean) => {
      const tracks = collectTracks(node);
      if (tracks.length === 0) return;
      player.playTracks(tracks, 0, { shuffle });
    },
    [player]
  );

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'folder') {
        const { folder: child } = item;
        return (
          <View style={styles.folderRow}>
            {/* Opening the folder is the whole left side of the row. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${child.name}, ${trackCount(child.totalTracks)}`}
              onPress={() => setOpenPath(child.path)}
              style={({ pressed }) => [
                styles.folderOpen,
                pressed && styles.folderPressed,
              ]}
            >
              <Glyph name="folder" size={24} color={color.dim} />
              <View style={styles.folderText}>
                <Text style={styles.folderName} numberOfLines={1}>
                  {child.name}
                </Text>
                <Text style={styles.folderMeta}>
                  {trackCount(child.totalTracks)}
                </Text>
              </View>
            </Pressable>

            <Key
              variant="inline"
              icon="play"
              label={`Play ${child.name}`}
              onPress={() => playFolder(child, player.shuffle)}
            />
            <Key
              variant="inline"
              icon="plus"
              label={`Add ${child.name} to the queue`}
              onPress={() => player.enqueue(collectTracks(child))}
            />
          </View>
        );
      }

      return (
        <TrackRow
          track={item.track}
          playing={player.track?.id === item.track.id}
          onPress={() => player.playTracks(ownTracks, item.index)}
          action={{
            icon: 'plus',
            label: `Add ${item.track.title} to the queue`,
            onPress: () => player.enqueue([item.track]),
          }}
        />
      );
    },
    [ownTracks, playFolder, player]
  );

  // ------------------------------------------------------------ empty states

  if (library.status === 'idle' || library.status === 'requesting-permission') {
    return <EmptyState icon="folder" title="Preparando biblioteca" detail="Espera a que Android compruebe el acceso al audio." />;
  }

  // With a cached library still on hand, a failed rescan is a note above the
  // list, not a screen that hides music which still plays.
  if (library.status === 'error' && library.tracks.length === 0) {
    return <EmptyState icon="folder" title="No se pudo leer la música" detail={library.error ?? 'Vuelve a intentarlo.'} action={{ label: 'Reintentar', onPress: library.rescan }} />;
  }

  if (library.status === 'denied') {
    return (
      <EmptyState
        icon="folder"
        title="Permite el acceso a tu música"
        detail={
          library.permissionBlocked
            ? 'Abre Permisos y activa Música y audio, o Almacenamiento en Android antiguo.'
            : 'Autoriza la lectura del audio del almacenamiento interno o la tarjeta SD.'
        }
        action={{
          label: library.permissionBlocked ? 'Abrir Ajustes' : 'Permitir acceso',
          onPress: library.permissionBlocked
            ? openPermissionSettings
            : library.grantAccess,
        }}
        secondaryAction={!library.permissionBlocked ? { label: 'Abrir Ajustes', onPress: openPermissionSettings } : undefined}
      />
    );
  }

  if (library.status === 'scanning' && library.tracks.length === 0) {
    return (
      <EmptyState
        icon="refresh"
        title="Looking for music"
        detail={`${library.found} files found so far.`}
      />
    );
  }

  if (!folder) {
    return (
      <EmptyState
        icon="folder"
        title="No audio on this device"
        detail="Copy music to internal storage or an SD card, then scan again."
        action={{ label: 'Scan again', onPress: library.rescan }}
      />
    );
  }

  // ------------------------------------------------------------------ listing

  const runtime = formatRuntime(
    collectTracks(folder).reduce((sum, track) => sum + track.duration, 0)
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Key
          variant="inline"
          icon="back"
          label="Up one folder"
          disabled={crumbs.length <= 1}
          onPress={() => {
            const parent = crumbs[crumbs.length - 2];
            setOpenPath(parent ? parent.path : null);
          }}
        />

        {/*
          The trail, not a single path string: each step is a target, which is
          how you get back three levels without three taps.
        */}
        <FlatList
          horizontal
          data={crumbs}
          keyExtractor={(node) => node.path}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.crumbs}
          renderItem={({ item, index }) => {
            const last = index === crumbs.length - 1;
            return (
              <View style={styles.crumbWrap}>
                {index > 0 ? (
                  <Glyph name="forward" size={16} color={color.faint} />
                ) : null}
                <Text
                  accessibilityRole="button"
                  onPress={() => setOpenPath(index === 0 ? null : item.path)}
                  numberOfLines={1}
                  style={[styles.crumb, last && styles.crumbCurrent]}
                >
                  {index === 0 ? prettyPath(item.path) : item.name}
                </Text>
              </View>
            );
          }}
        />

        <Key
          variant="inline"
          icon="refresh"
          label="Scan again"
          active={library.status === 'scanning'}
          activeColor={color.dial}
          onPress={library.rescan}
        />
      </View>

      {library.error ? (
        <Text numberOfLines={2} style={styles.note}>
          {library.error}
        </Text>
      ) : null}

      <Seam />

      {!compact ? <SectionHeader
        title={folder.name}
        meta={`${trackCount(folder.totalTracks)} · ${runtime}`}
        action={
          <View style={styles.headerKeys}>
            <Key
              variant="inline"
              icon="play"
              label="Play this folder"
              onPress={() => playFolder(folder, false)}
            />
            <Key
              variant="inline"
              icon="shuffle"
              label="Shuffle this folder"
              onPress={() => playFolder(folder, true)}
            />
          </View>
        }
      /> : null}

      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'folder' ? `d:${row.folder.path}` : `t:${row.track.id}`
        }
        renderItem={renderRow}
        ItemSeparatorComponent={Seam}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.list}
      />

      {!compact && library.untagged > 0 ? (
        <Text style={styles.tagging}>
          Reading tags — {library.untagged} to go
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  crumbs: {
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  crumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  crumb: {
    ...type.body,
    color: color.dim,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    maxWidth: 220,
  },
  crumbCurrent: {
    ...type.bodyMedium,
    color: color.illum,
  },
  note: {
    ...type.label,
    color: color.dim,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  headerKeys: {
    flexDirection: 'row',
    gap: space.sm,
  },
  list: {
    paddingBottom: space.lg,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  folderOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: space.md,
    paddingRight: space.sm,
    borderRadius: radius.row,
  },
  folderPressed: {
    backgroundColor: color.raised,
  },
  folderText: {
    flex: 1,
    gap: 1,
  },
  folderName: {
    ...type.bodyMedium,
    color: color.illum,
  },
  folderMeta: {
    ...type.label,
    color: color.dim,
  },
  tagging: {
    ...type.label,
    color: color.dim,
    textAlign: 'center',
    paddingVertical: space.sm,
  },
});
