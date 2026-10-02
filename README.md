# Console

Reproductor de música y launcher para una pantalla de auto con Android.
Sin suscripción, sin cuenta, sin nube: lee los archivos del dispositivo y los
reproduce.

- Reproductor con **visualizador de espectro real** (FFT del audio que suena,
  no una animación decorativa).
- **Explorador de archivos** por carpetas, derivado del escaneo de MediaStore.
- **Cola** en el orden real de reproducción, aleatorio y repetición
  (off / toda la cola / una pista).
- **Etiquetas ID3** leídas por la app: artista, álbum y carátula incrustada.
- **Grilla de apps** con los iconos reales del dispositivo: Maps, Waze,
  Spotify, Amazon Music, etc.
- Se puede fijar como **pantalla de inicio** del head unit.

---

## Tres cosas que Android no permite, y cómo las resuelve esta app

Conviene tenerlas claras antes de probar, porque no son limitaciones del
código sino del sistema.

### 1. Esto no es una app de Android Auto

Android Auto solo acepta apps hechas con la *Car App Library*: plantillas
fijas, sin UI propia. Una interfaz React Native **no puede** correr en la
pantalla de Android Auto.

El objetivo real es otro y funciona perfecto: **una radio o tablet con Android
completo** (los head units que se instalan en el tablero). Ahí la app corre a
pantalla completa y puede ser el launcher del sistema.

### 2. No se puede incrustar Spotify ni Maps dentro de la app

No existe API para eso en ningún nivel de permisos. Solo el sistema puede
componer dos apps en pantalla.

Lo que sí se usa es el **multiventana nativo**: `launchAdjacent()` manda
`FLAG_ACTIVITY_LAUNCH_ADJACENT`, que pide a Android poner la app al lado en
vez de encima. Desde Android 10 ese flag solo surte efecto si **esta app ya
está en split-screen**, y ninguna API sin privilegios permite entrar a ese
modo (`setLaunchWindowingMode` es del sistema; la única vía pública es
`GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN`, que necesita un servicio de
accesibilidad que el usuario active a mano).

En la práctica: **mantené pulsada** una app en la grilla y se abre al lado si
ya estás en split-screen, y a pantalla completa si no. Para dejarlo en
split-screen, usá Recientes una vez. La pantalla de Apps lo explica ahí mismo
para que no parezca un bug.

Si querés el split de un toque, el camino es escribir un módulo nativo con un
`AccessibilityService`. Queda fuera de lo que hay hoy acá.

### 3. El visualizador necesita PCM, así que no corre en Expo Go

`expo-av` / `expo-audio` no exponen las muestras de audio. Se usa
`react-native-audio-api` (Web Audio API nativa) con un `AnalyserNode` real.
Eso implica **dev client / prebuild**, no Expo Go. Como generás APKs, no
cambia nada para vos.

---

## Cómo correrlo

Necesitás **una** de estas dos: SDK de Android local, o una cuenta de Expo
para compilar en la nube. En esta máquina no había SDK, así que el APK no está
compilado todavía.

### Opción A — EAS Build (sin SDK local, más simple)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

`eas.json` ya está configurado para producir **APK** (no AAB), que es lo que
se puede instalar directo en el head unit.

Para desarrollar con recarga en vivo, primero un dev client:

```bash
eas build -p android --profile development
# instalá ese APK en la tablet, después:
npm start
```

### Opción B — Build local (requiere Android SDK)

Instalá Android Studio (o solo las command-line tools) y exportá
`ANDROID_HOME`. Después:

```bash
npm run prebuild      # genera ./android
npm run apk:debug     # compila e instala por adb
npm run apk:release   # APK de release
```

El APK de release queda en
`android/app/build/outputs/apk/release/app-release.apk`.

### Ponerla como launcher

Instalá el APK, y después **Ajustes → Apps → Apps predeterminadas → App de
inicio → Console**. También hay un atajo: pantalla **Apps → el botón del
dial** abre esa pantalla de ajustes directo.

El plugin `plugins/withCarLauncher.js` es lo que agrega
`category.HOME` a `MainActivity` para que Android la ofrezca como opción.

---

## Comandos

```bash
npm start           # Metro con dev client
npm test            # 158 tests, sin framework externo
npm run typecheck   # tsc --noEmit
npm run prebuild    # regenera ./android desde app.json
```

---

## Cómo está armado

La lógica que se puede equivocar en silencio está separada del IO y de React,
en módulos puros con tests. La que no se puede testear sin un dispositivo está
aislada en providers.

```
src/
  theme.ts                 Tokens: color, tipografía, escala, TOUCH mínimo
  types.ts                 Track, FolderNode, RepeatMode

  lib/
    id3-parse.ts           ID3v2.2/2.3/2.4 + ID3v1, byte a byte      [puro]
    id3.ts                 IO + caché de carátulas en disco
    format.ts              Tiempos, rutas, plurales                 [puro]

  library/
    scan.ts                MediaStore -> Track[], etiquetado por lotes
    tree.ts                Track[] -> árbol de carpetas              [puro]
    LibraryProvider.tsx    Permiso, escaneo, caché, estado

  audio/
    queue.ts               Cola, aleatorio, repetición               [puro]
    spectrum.ts            FFT -> bandas, suavizado                  [puro]
    useSpectrum.ts         Sondeo del analizador -> hilo de UI
    PlayerProvider.tsx     <Audio> + AnalyserNode + transporte

  components/
    Gauge.tsx              El tacómetro (Skia, por frame)
    DialSeekBar.tsx        Dial de sintonía con aguja predicha
    Glyph.tsx              Iconos como paths, sin librería
    Key.tsx                Las teclas duras
    Rail.tsx  TransportBar.tsx  Panel.tsx  TrackRow.tsx  EmptyState.tsx

  launcher/
    apps.ts                Intents, split-screen, iconos reales

  screens/
    NowPlayingScreen  LibraryScreen  QueueScreen  AppsScreen

plugins/withCarLauncher.js  Manifest: HOME, resizeable, <queries>, permisos
scripts/ts-resolve.mjs      Resolver de imports para node --test
```

### La cadena de audio

```
<Audio> ──> MediaElementAudioSourceNode ──> AnalyserNode ──> destination
```

`<Audio>` hace **streaming** desde disco en vez de decodificar el archivo
entero a un `AudioBuffer`. La diferencia importa: una pista de cuatro minutos
decodificada a float32 estéreo son ~84 MB, y un head unit barato no tiene eso
de sobra por cada tema de la cola. Con streaming la memoria queda plana y el
analizador igual recibe PCM real, así que las barras son el espectro de lo que
estás escuchando.

El sondeo del FFT corre a 30 Hz en el hilo de JS (donde vive el objeto JSI del
analizador) y el dibujo a 60 Hz en el hilo de UI. Sondear a 30 y animar a 60 se
ve igual que sondear a 60 y cuesta la mitad.

### Diseño

Concepto: **tablero de instrumentos**, no dashboard de SaaS.

- Dos iluminaciones distintas, como un tablero real: azul `#37B6E9` (de
  amplificador hi-fi) para todo lo que lleva audio, ámbar `#FF9E2C` para un
  control encendido. Nada más brilla.
- El visualizador es un **tacómetro**: la carátula dentro del dial, el
  espectro irradiando del aro. Simétrico, con graves abajo y agudos arriba.
  El color codifica frecuencia — un `SweepGradient` mapea ángulo a color, y
  acá el ángulo *es* la frecuencia.
- El seek es un **dial de sintonía** con marcas y aguja, no una pill.
- Barlow + Barlow Semi Condensed: una familia, dos anchos. Barlow nace de la
  señalética y el instrumental automotriz.
- Paneles separados por costuras hairline, sin tarjetas flotantes con sombra.
- Nada interactivo mide menos de 64 pt: los 48 dp de Google son un número de
  teléfono quieto, un auto en movimiento necesita más.
- Texto secundario verificado a ≥ 4.7:1 de contraste sobre las dos
  superficies.

---

## Tests

158 tests con `node:test` y el type-stripping nativo de Node 24. Sin Jest, sin
paso de build.

```
src/lib/__tests__/id3-parse.test.ts    ID3: encodings, unsync, header
                                       extendido, APIC, tags corruptos
src/audio/__tests__/queue.test.ts      Aleatorio preservando la pista actual,
                                       repeat one vs. botón next, "anterior"
                                       reinicia pasados 3 s, remover la pista
                                       que suena
src/audio/__tests__/spectrum.test.ts   Bandas por octava, picos vs. medias,
                                       ataque/caída independiente del frame
src/library/__tests__/tree.test.ts     Colapso de carpetas, orden numérico,
                                       volúmenes separados, formatters
```

El aleatorio recibe su RNG por parámetro, así que se verifica exacto y no
"probablemente".

---

## Estado

**Verificado:** typecheck limpio, 158/158 tests, bundle de Metro OK (3.8 MB
Hermes), `expo prebuild` genera el proyecto y el manifest sale correcto
(`category.HOME`, `resizeableActivity`, `<queries>`, foreground service
`mediaPlayback`, sin permisos de fotos ni video).

**No verificado:** no se compiló ni se corrió el APK — esta máquina no tiene
Android SDK. Todo el comportamiento en dispositivo (audio, analizador,
permisos, intents) está escrito contra las APIs reales pero no ejecutado.

**Ideas para después**

- Ecualizador: ya hay `BiquadFilterNode` en la cadena de audio disponible.
- Playlists `.m3u`.
- Búsqueda por voz, para no escribir manejando.
- Split-screen de un toque con un `AccessibilityService` nativo.
