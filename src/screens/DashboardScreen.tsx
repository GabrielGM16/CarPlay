import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebPanel } from '../components/WebPanel';
import { useDisplay } from '../display/DisplayProvider';
import { PANEL_CONTENT, type PanelContent } from '../display/preferences';
import { color, radius, type } from '../theme';
import { LibraryScreen } from './LibraryScreen';
import { NowPlayingScreen } from './NowPlayingScreen';
import { QueueScreen } from './QueueScreen';

const LABELS: Record<PanelContent, string> = {
  'now-playing': 'Música', library: 'Biblioteca', queue: 'Cola',
  youtube: 'YouTube · Web', 'youtube-music': 'YT Music · Web', maps: 'Maps · Web',
};
const URLS = { youtube: 'https://m.youtube.com', 'youtube-music': 'https://music.youtube.com', maps: 'https://www.google.com/maps' };

export function DashboardScreen() {
  const display = useDisplay();
  const [editing, setEditing] = useState<number | null>(null);
  const indices = Array.from({ length: display.count }, (_, index) => index);
  const rows = display.count <= 2 ? [indices] : [indices.slice(0, 2), indices.slice(2)];
  const browse = () => display.setPanel(0, 'library');
  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>Tu tablero</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controls}>
          {([1, 2, 3, 4] as const).map((count) => (
            <Pressable key={count} accessibilityRole="button" accessibilityLabel={`${count} paneles`} accessibilityState={{ selected: display.count === count }} onPress={() => display.setCount(count)} style={[styles.choice, display.count === count && styles.selected]}>
              <Text style={styles.label}>{count}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.meta}>paneles</Text>
      </View>
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((index) => {
              const content = display.panels[index];
              return (
                <View key={index} style={styles.panel}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar panel ${index + 1}: ${LABELS[content]}`} style={styles.panelHeader} onPress={() => setEditing(index)}>
                    <Text style={styles.label}>{index + 1} / {LABELS[content]}</Text>
                    <Text style={styles.meta}>Cambiar</Text>
                  </Pressable>
                  <View style={styles.content}>
                    {content === 'now-playing' ? <NowPlayingScreen onBrowse={() => display.setPanel(index, 'library')} compact />
                      : content === 'library' ? <LibraryScreen compact={display.count > 1} />
                      : content === 'queue' ? <QueueScreen onBrowse={browse} compact={display.count > 1} />
                      : <WebPanel key={content} url={URLS[content]} />}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.picker}>
            <Text style={styles.title}>Elige el contenido del panel</Text>
            <ScrollView>
              {PANEL_CONTENT.map((item) => <Pressable key={item} accessibilityRole="button" style={styles.pickOption} onPress={() => { if (editing !== null) display.setPanel(editing, item); setEditing(null); }}><Text style={styles.label}>{LABELS[item]}</Text></Pressable>)}
            </ScrollView>
            <Pressable accessibilityRole="button" style={styles.pickOption} onPress={() => setEditing(null)}><Text style={styles.meta}>Cancelar</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56 },
  title: { ...type.subtitle, color: color.illum },
  controls: { gap: 8, alignItems: 'center' },
  choice: { minWidth: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  selected: { backgroundColor: color.dialDeep, borderWidth: 1, borderColor: color.dial },
  label: { ...type.label, color: color.illum },
  meta: { ...type.label, color: color.dim },
  grid: { flex: 1, padding: 8, gap: 8 },
  row: { flex: 1, flexDirection: 'row', gap: 8, minHeight: 0 },
  panel: { flex: 1, minWidth: 0, borderRadius: radius.panel, borderWidth: 1, borderColor: color.seam, backgroundColor: color.graphite, overflow: 'hidden' },
  panelHeader: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: color.seam },
  content: { flex: 1, minHeight: 0 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000AA', padding: 16 },
  picker: { width: '100%', maxWidth: 440, maxHeight: '95%', padding: 16, backgroundColor: color.raised, borderRadius: radius.panel },
  pickOption: { minHeight: 56, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: color.seam },
});
