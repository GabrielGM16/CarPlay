import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { color, type } from '../theme';
import { canNavigateInsidePanel } from '../display/web-policy';
import { systemSpectrumSupported, useSystemAudioPermission, useSystemSpectrum } from '../audio/useSystemSpectrum';
import { SpectrumStrip } from './SpectrumStrip';

export function WebPanel({ url }: { url: string }) {
  const browser = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  // Videos play inside the WebView, out of reach of the player's analyser, so
  // the strip follows the tablet's whole output instead.
  const [wavesGranted, requestWaves] = useSystemAudioPermission();
  const spectrum = useSystemSpectrum(wavesGranted);
  return (
    <View style={styles.wrap}>
      <View style={styles.tools}>
        <Pressable accessibilityRole="button" disabled={!canGoBack} onPress={() => browser.current?.goBack()} style={styles.button}>
          <Text style={[styles.label, !canGoBack && styles.disabled]}>Atrás</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.address}>{new URL(url).hostname} · Web</Text>
        {systemSpectrumSupported && !wavesGranted ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mostrar ondas del audio" onPress={requestWaves} style={styles.button}>
            <Text style={styles.label}>Ondas</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => { setFailed(false); browser.current?.reload(); }} style={styles.button}>
          <Text style={styles.label}>Recargar</Text>
        </Pressable>
      </View>
      <WebView
        ref={browser}
        source={{ uri: url }}
        style={styles.browser}
        // Intercept every scheme here; a narrower whitelist delegates rejected
        // origins to Linking.openURL before our handler can cancel app intents.
        originWhitelist={['*']}
        // Cancel app intents and popup handoffs so a link stays in the launcher.
        onShouldStartLoadWithRequest={(request) => canNavigateInsidePanel(request.url)}
        setSupportMultipleWindows={false}
        // Maps needs the device position; the WebView asks Android for
        // ACCESS_FINE_LOCATION the first time a page requests it.
        geolocationEnabled
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false); }}
        onRenderProcessGone={() => { setFailed(true); setLoading(false); }}
        // Android reports main-frame errors only, and with the redirected URL,
        // so comparing against `url` would never match.
        onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 400) setFailed(true); }}
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback
      />
      {wavesGranted && spectrum.available ? <SpectrumStrip spectrum={spectrum} /> : null}
      {loading ? <ActivityIndicator pointerEvents="none" color={color.dial} style={styles.loading} /> : null}
      {failed ? <View style={styles.error}><Text style={styles.label}>No se pudo cargar. Comprueba internet y pulsa Recargar.</Text></View> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1 },
  tools: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.graphite },
  button: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' },
  label: { ...type.label, color: color.illum },
  disabled: { color: color.dim },
  address: { ...type.label, color: color.dim, flex: 1 },
  browser: { flex: 1, backgroundColor: color.graphite },
  loading: { position: 'absolute', top: 64, right: 16 },
  error: { position: 'absolute', top: 48, bottom: 0, left: 0, right: 0, padding: 20, justifyContent: 'center', backgroundColor: color.graphite },
});
