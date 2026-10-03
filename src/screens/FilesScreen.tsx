/**
 * The raw file explorer: every folder on internal storage and each card, not
 * just what MediaStore chose to index.
 *
 * Audio plays straight from here. "Añadir a la biblioteca" asks MediaStore to
 * index the folder, after which it joins the library with tags and artwork
 * like everything else — the explorer never keeps a second library of its own.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlayer } from '../audio/PlayerProvider';
import { EmptyState } from '../components/EmptyState';
import { Glyph, type GlyphName } from '../components/Glyph';
import { Key } from '../components/Key';
import { Seam } from '../components/Panel';
import { device, type FileEntry } from '../launcher/device';
import { useLibrary } from '../library/LibraryProvider';
import {
  crumbsOf,
  formatSize,
  kindOf,
  parentOf,
  sortEntries,
  trackForFile,
  type FileKind,
} from '../library/files';
import { isPlayable } from '../library/playable';
import { basename, prettyPath } from '../lib/format';
import { color, radius, space, TOUCH, type } from '../theme';

/** Upper bound on files gathered when playing or indexing a whole folder. */
const WALK_LIMIT = 3000;

const supported =
  typeof device?.listDirectory === 'function' &&
  typeof device?.getStorageRoots === 'function';

const ICONS: Record<FileKind, GlyphName> = {
  folder: 'folder',
  audio: 'note',
  video: 'play',
  other: 'queue',
};

function useAllFilesAccess(): boolean {
  const [granted, setGranted] = useState(() => device?.hasAllFilesAccess?.() ?? false);
  useEffect(() => {
    // Access is granted in Settings, so recheck whenever the user comes back.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setGranted(device?.hasAllFilesAccess?.() ?? false);
    });
    return () => subscription.remove();
  }, []);
  return granted;
}

export function FilesScreen() {
  const player = usePlayer();
  const library = useLibrary();
  const access = useAllFilesAccess();

  const roots = useMemo(() => (supported && access ? device!.getStorageRoots!() : []), [access]);
  /** `null` lists the storage roots themselves. */
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!access || path === null) return;
    let cancelled = false;
    setError(null);
    device!.listDirectory!(path)
      .then((list) => { if (!cancelled) setEntries(sortEntries(list)); })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEntries([]);
        setError(cause instanceof Error ? cause.message : 'No se pudo abrir la carpeta.');
      });
    return () => { cancelled = true; };
  }, [access, path]);

  const byUri = useMemo(
    () => new Map(library.tracks.map((track) => [track.uri, track])),
    [library.tracks]
  );

  const audioHere = useMemo(
    () => entries.filter((entry) => !entry.isDirectory && isPlayable(entry.name)),
    [entries]
  );

  /** Every audio file under `folder`, in name order. */
  const gatherAudio = useCallback(async (folder: string) => {
    const files = await device!.walkFiles!(folder, WALK_LIMIT);
    return files.filter((file) => isPlayable(basename(file)));
  }, []);

  const playFolder = useCallback(async (folder: string, queueOnly: boolean) => {
    setBusy(folder);
    try {
      const tracks = (await gatherAudio(folder)).map((file) => trackForFile(file, byUri));
      if (tracks.length === 0) return;
      if (queueOnly) player.enqueue(tracks);
      else player.playTracks(tracks, 0);
    } finally {
      setBusy(null);
    }
  }, [byUri, gatherAudio, player]);

  const addToLibrary = useCallback(async (folder: string) => {
    setBusy(folder);
    try {
      const files = await gatherAudio(folder);
      await device!.scanPaths?.(files);
      library.rescan();
    } finally {
      setBusy(null);
    }
  }, [gatherAudio, library]);

  const renderRow = useCallback(({ item }: { item: FileEntry }) => {
    const kind = kindOf(item);
    const audioIndex = kind === 'audio' ? audioHere.indexOf(item) : -1;
    const onPress =
      kind === 'folder' ? () => setPath(item.path)
        : kind === 'audio' ? () => player.playTracks(audioHere.map((entry) => trackForFile(entry.path, byUri)), audioIndex)
          : undefined;
    const playing = kind === 'audio' && player.track?.uri === trackForFile(item.path, byUri).uri;

    return (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={kind === 'folder' ? `Abrir ${item.name}` : item.name}
          disabled={!onPress}
          onPress={onPress}
          style={({ pressed }) => [styles.open, pressed && styles.pressed]}
        >
          <Glyph name={ICONS[kind]} size={24} color={playing ? color.dial : kind === 'other' || kind === 'video' ? color.faint : color.dim} />
          <View style={styles.text}>
            <Text style={[styles.name, !onPress && styles.inert, playing && styles.playing]} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.meta}>{kind === 'folder' ? 'Carpeta' : formatSize(item.size)}</Text>
          </View>
        </Pressable>
        {kind === 'folder' ? (
          <>
            <Key variant="inline" icon="play" label={`Reproducir ${item.name}`} onPress={() => void playFolder(item.path, false)} disabled={busy !== null} />
            <Key variant="inline" icon="plus" label={`Añadir ${item.name} a la cola`} onPress={() => void playFolder(item.path, true)} disabled={busy !== null} />
          </>
        ) : kind === 'audio' ? (
          <Key variant="inline" icon="plus" label={`Añadir ${item.name} a la cola`} onPress={() => player.enqueue([trackForFile(item.path, byUri)])} />
        ) : null}
      </View>
    );
  }, [audioHere, busy, byUri, playFolder, player]);

  // ------------------------------------------------------------ empty states

  if (!supported) {
    return <EmptyState icon="folder" title="Instala el nuevo APK" detail="Esta versión de la app no incluye el explorador de archivos." />;
  }

  if (!access) {
    return (
      <EmptyState
        icon="folder-open"
        title="Permite el acceso a tus archivos"
        detail="Activa «Permitir acceso para administrar todos los archivos» para ver todas las carpetas de la memoria y la tarjeta SD."
        action={{ label: 'Abrir Ajustes', onPress: () => void device?.openAllFilesAccessSettings?.() }}
      />
    );
  }

  if (path === null) {
    return (
      <FlatList
        data={roots}
        keyExtractor={(root) => root}
        ItemSeparatorComponent={Seam}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => setPath(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Glyph name="folder" size={24} color={color.dial} />
            <Text style={styles.name}>{prettyPath(item) === 'Internal storage' ? 'Memoria interna' : prettyPath(item).replace('SD card', 'Tarjeta SD')}</Text>
          </Pressable>
        )}
      />
    );
  }

  const crumbs = crumbsOf(path, roots);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Key variant="inline" icon="back" label="Subir una carpeta" onPress={() => setPath(parentOf(path, roots))} />
        <Text style={styles.crumbs} numberOfLines={1}>
          {crumbs.length > 1 ? crumbs.slice(1).map(basename).join(' / ') : 'Raíz'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Indexa la música de esta carpeta para que aparezca en la biblioteca"
          disabled={busy !== null}
          onPress={() => void addToLibrary(path)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[styles.actionLabel, busy !== null && styles.inert]}>
            {busy === path ? 'Añadiendo…' : 'Añadir a la biblioteca'}
          </Text>
        </Pressable>
      </View>
      <Seam />
      {error ? (
        <EmptyState icon="folder" title="No se pudo abrir" detail={error} action={{ label: 'Subir', onPress: () => setPath(parentOf(path, roots)) }} />
      ) : entries.length === 0 ? (
        <EmptyState icon="folder-open" title="Carpeta vacía" detail="No hay archivos visibles aquí." />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.path}
          renderItem={renderRow}
          ItemSeparatorComponent={Seam}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  crumbs: { ...type.bodyMedium, color: color.illum, flex: 1 },
  action: { minHeight: TOUCH - 16, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.row, backgroundColor: color.raised },
  actionLabel: { ...type.label, color: color.dial },
  list: { paddingBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, paddingHorizontal: space.md, gap: space.md },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: space.md, paddingRight: space.sm, borderRadius: radius.row },
  pressed: { backgroundColor: color.raised },
  text: { flex: 1, gap: 1 },
  name: { ...type.bodyMedium, color: color.illum },
  playing: { color: color.dial },
  inert: { color: color.dim },
  meta: { ...type.label, color: color.dim },
});
