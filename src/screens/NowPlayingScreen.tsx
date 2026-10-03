import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePlayer } from '../audio/PlayerProvider';
import { useSpectrum } from '../audio/useSpectrum';
import { upcomingTracks } from '../audio/queue';
import { EmptyState } from '../components/EmptyState';
import { Gauge } from '../components/Gauge';
import { Glyph } from '../components/Glyph';
import { useDisplay } from '../display/DisplayProvider';
import type { MusicStyle } from '../display/preferences';
import { color, radius, type } from '../theme';

const STYLES: { id: MusicStyle; label: string }[] = [
  { id: 'dial', label: 'Dial' }, { id: 'cover', label: 'Carátula' }, { id: 'ambient', label: 'Ambiente' },
];
export interface NowPlayingScreenProps { onBrowse: () => void; compact?: boolean }

export function NowPlayingScreen({ onBrowse, compact = false }: NowPlayingScreenProps) {
  const player = usePlayer();
  const display = useDisplay();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const spectrum = useSpectrum(player.analyser, player.isPlaying && display.musicStyle === 'dial', player.analyserEpoch);
  const track = player.track;
  const next = upcomingTracks(player.queue)[0] ?? null;
  const artworkSize = Math.max(40, Math.min(size.height - 24, size.width * (compact ? 0.32 : 0.42), 360));
  const tight = compact || size.width < 600 || size.height < 220;
  const currentStyle = STYLES.find((item) => item.id === display.musicStyle)!;
  return (
    <View style={styles.wrap}>
      {display.musicStyle === 'ambient' ? (
        <View pointerEvents="none" style={styles.backdrop}>
          {track?.artwork ? <Image source={{ uri: track.artwork }} style={styles.backdrop} contentFit="cover" blurRadius={32} /> : null}
          <LinearGradient colors={['#133747DD', '#10111DDD', '#06070AF2']} style={styles.backdrop} />
        </View>
      ) : null}
      <View style={styles.toolbar}>
        {compact ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar estilo de música" onPress={() => display.setMusicStyle(STYLES[(STYLES.findIndex((item) => item.id === display.musicStyle) + 1) % STYLES.length].id)} style={styles.styleKey}>
            <Text style={styles.styleLabel}>Estilo: {currentStyle.label}</Text>
          </Pressable>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
            {STYLES.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: display.musicStyle === item.id }} onPress={() => display.setMusicStyle(item.id)} style={[styles.styleKey, display.musicStyle === item.id && styles.selected]}><Text style={styles.styleLabel}>{item.label}</Text></Pressable>)}
          </ScrollView>
        )}
      </View>
      {!track ? <EmptyState icon="note" title="Tu música, a tu estilo" detail="Abre la biblioteca y elige una canción." action={{ label: 'Abrir biblioteca', onPress: onBrowse }} /> : (
        <View style={[styles.body, tight && styles.tightBody]} onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}>
          {display.musicStyle === 'dial' ? <Gauge size={artworkSize} artwork={track.artwork} spectrum={spectrum} active={player.isPlaying} /> : (
            <View style={[styles.artwork, { width: artworkSize, height: artworkSize }]}>
              {track.artwork ? <Image source={{ uri: track.artwork }} style={styles.backdrop} contentFit="cover" /> : <Glyph name="note" size={artworkSize * 0.35} color={color.dial} />}
            </View>
          )}
          <View style={styles.text}>
            <Text style={styles.status}>{player.isPlaying ? 'SONANDO AHORA' : 'EN PAUSA'}</Text>
            <Text style={[styles.title, tight && styles.smallTitle]} numberOfLines={tight ? 1 : 2}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist ?? 'Artista desconocido'}</Text>
            {!tight && track.album ? <Text style={styles.album} numberOfLines={1}>{track.album}</Text> : null}
            {!tight && next ? <View style={styles.next}><Text style={styles.album}>A continuación</Text><Text style={styles.artist} numberOfLines={1}>{next.title}</Text></View> : null}
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  toolbar: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' },
  choices: { gap: 8 },
  styleKey: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.row },
  selected: { backgroundColor: color.dialDeep },
  styleLabel: { ...type.label, color: color.illum },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 32, paddingHorizontal: 24 },
  tightBody: { gap: 12, paddingHorizontal: 12 },
  artwork: { borderRadius: radius.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  text: { flex: 1, minWidth: 0, gap: 4 },
  status: { ...type.label, fontSize: 11, color: color.dial, letterSpacing: 1.5 },
  title: { ...type.hero, color: color.illum },
  smallTitle: { ...type.subtitle },
  artist: { ...type.body, color: color.illum },
  album: { ...type.label, color: color.dim },
  next: { marginTop: 24, borderTopWidth: 1, borderTopColor: color.seam, paddingTop: 12, gap: 4 },
});
