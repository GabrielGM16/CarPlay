/**
 * Console — a music player and launcher for an Android head unit.
 *
 * The shell: a fixed rail on the left, one screen in the middle, and the
 * transport bar across the bottom. Nothing navigates away from the transport,
 * so the controls you need while driving are never more than one tap deep.
 *
 * Landscape is locked and the screen is kept awake, because this runs on a
 * dashboard rather than in a pocket.
 */
// Imported per weight, not from the package root: the root barrel re-exports
// all eighteen weights of each family, and Metro would bundle every one of
// them into the APK. These five are the whole type system.
import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { BarlowSemiCondensed_500Medium } from '@expo-google-fonts/barlow-semi-condensed/500Medium';
import { BarlowSemiCondensed_600SemiBold } from '@expo-google-fonts/barlow-semi-condensed/600SemiBold';
import { useFonts } from 'expo-font';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { PlayerProvider } from './src/audio/PlayerProvider';
import { DisplayProvider, useDisplay } from './src/display/DisplayProvider';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { Rail, type Destination } from './src/components/Rail';
import { TransportBar } from './src/components/TransportBar';
import { LibraryProvider } from './src/library/LibraryProvider';
import { AppsScreen } from './src/screens/AppsScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { NowPlayingScreen } from './src/screens/NowPlayingScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { color } from './src/theme';

function Shell() {
  const [destination, setDestination] = useState<Destination>('dashboard');
  const display = useDisplay();

  return (
    <View style={styles.shell}>
      <Rail current={destination} onSelect={setDestination} />

      <View style={styles.stage}>
        <View style={styles.screen}>
          {destination === 'dashboard' ? (
            <DashboardScreen />
          ) : destination === 'now-playing' ? (
            <NowPlayingScreen onBrowse={() => setDestination('library')} />
          ) : destination === 'library' ? (
            <LibraryScreen />
          ) : destination === 'queue' ? (
            <QueueScreen onBrowse={() => setDestination('library')} />
          ) : (
            <AppsScreen onOpenWeb={(content) => { display.openWeb(content); setDestination('dashboard'); }} onDashboard={() => setDestination('dashboard')} />
          )}
        </View>

        <TransportBar />
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    BarlowSemiCondensed_500Medium,
    BarlowSemiCondensed_600SemiBold,
  });

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    );
    void activateKeepAwakeAsync();

    return () => {
      deactivateKeepAwake();
    };
  }, []);

  // A missing font should not be a black screen: render with the platform
  // fallback rather than waiting forever on a load that already failed.
  if (!fontsLoaded && !fontError) {
    return <View style={styles.booting} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar hidden />
        <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
          <LibraryProvider>
            <PlayerProvider>
              <DisplayProvider><Shell /></DisplayProvider>
            </PlayerProvider>
          </LibraryProvider>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.well,
  },
  booting: {
    flex: 1,
    backgroundColor: color.well,
  },
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: color.well,
  },
  stage: {
    flex: 1,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
});
