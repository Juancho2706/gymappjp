import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Linking, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { WebView } from 'react-native-webview'
import { Play } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { GLOWS } from '../lib/shadows'

/**
 * EVA DS — reproductor de video INLINE compartido (mobile).
 *
 * Espeja `apps/web/src/components/exercise/ExerciseVideo.tsx` + `lib/youtube.ts`:
 * la web embebe el video de un ejercicio en un iframe `youtube-nocookie` que
 * autoplay + mute + loop SIN controles (se comporta como un GIF) y usa la IFrame
 * API para loopear el recorte `[start,end]` del coach. En mobile hacíamos
 * `Linking.openURL` (abría YouTube afuera) — esta primitiva lo reemplaza por
 * reproducción DENTRO de la app, con la misma jerarquía visual (16:9, poster con
 * botón play sobre el DS sport-glow).
 *
 * Detección de fuente (idéntica a la de la web):
 *   - YouTube (watch / youtu.be / embed / shorts) → WebView con HTML que carga la
 *     IFrame API de `youtube-nocookie`; loopea el tramo [start,end] (mismo truco
 *     que la web: seekTo(start) al cruzar `end` / al ENDED). `react-native-webview`
 *     YA está en deps.
 *   - mp4 / webm / stream directo (video_url no-YouTube de ExerciseDB) → `expo-video`
 *     (Expo SDK 54 ⇒ expo-video ~3.x). expo-video NO está instalado todavía: se
 *     declara en package.json y se carga con `require` GUARDADO, de modo que:
 *       · antes de `expo install expo-video` el archivo compila igual (no hay import
 *         estático que rompa el typecheck) y cae al fallback "abrir afuera";
 *       · una vez instalado, reproduce inline con loop/mute/trim.
 *     (La abrumadora mayoría de los ejercicios traen YouTube, que ya funciona 100%.)
 *
 * Reglas DS: clases NativeWind del tailwind.config (bg-surface-sunken / border-subtle)
 * + helper de elevación `GLOWS` (shadowColor literal, que RN exige). Light/dark salen
 * de `theme.scheme` (no hay overlay/safe-area: es contenido embebido, no full-screen).
 */

// ── expo-video: carga guardada (dep declarada, instalación diferida). Tipamos solo
//    la superficie que usamos para no requerir los tipos del paquete pre-install. ──
type ExpoVideoModule = {
  useVideoPlayer: (source: string, setup?: (player: ExpoVideoPlayer) => void) => ExpoVideoPlayer
  VideoView: ComponentType<{
    player: ExpoVideoPlayer
    style?: StyleProp<ViewStyle>
    contentFit?: 'contain' | 'cover' | 'fill'
    nativeControls?: boolean
    allowsFullscreen?: boolean
  }>
}
type ExpoVideoPlayer = {
  loop: boolean
  muted: boolean
  currentTime: number
  play: () => void
  addListener: (event: string, cb: (payload: { currentTime?: number }) => void) => { remove: () => void }
}

let ExpoVideo: ExpoVideoModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoVideo = require('expo-video') as ExpoVideoModule
} catch {
  ExpoVideo = null
}

const YT_ID = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/

/** Extrae el id (11 chars) de una URL de YouTube; null si no es YouTube. */
function youtubeId(url: string): string | null {
  const m = url.match(YT_ID)
  return m ? m[1] : null
}

/** Miniatura de YouTube (funciona aunque el embed esté bloqueado). */
function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
}

export interface VideoPlayerProps {
  /** URL del video: YouTube (watch/youtu.be/embed/shorts) o media directa (mp4/webm). */
  url: string
  /** Miniatura del poster. Si se omite y es YouTube, se deriva de img.youtube.com. */
  poster?: string | null
  /** Recorte del coach — segundos de inicio (loopea [start,end]). */
  start?: number | null
  /** Recorte del coach — segundo final. */
  end?: number | null
  /** Autoplay al montar (comportamiento GIF de la web). Default: false → poster + tap. */
  autoPlay?: boolean
  /** Silencio. Default true (los videos de ejercicio no suenan, regla del dueño). */
  muted?: boolean
  /** Loop. Default true. */
  loop?: boolean
  /** Estilo del contenedor 16:9 (radios/margen extra). */
  style?: StyleProp<ViewStyle>
  /** Accesibilidad. */
  title?: string
}

/**
 * Reproductor 16:9 con poster + botón play DS. Antes del primer play muestra el
 * poster (ahorra datos / respeta la policy de autoplay de iOS); al tocar monta el
 * player que reproduce en loop mudo. Pasar `autoPlay` para el modo GIF de la web.
 */
export function VideoPlayer({
  url,
  poster,
  start,
  end,
  autoPlay = false,
  muted = true,
  loop = true,
  style,
  title,
}: VideoPlayerProps) {
  const { theme } = useTheme()
  const [started, setStarted] = useState(autoPlay)

  const ytId = useMemo(() => youtubeId(url), [url])
  const isDirect = !ytId && /^https?:\/\//i.test(url)
  const posterUri = poster ?? (ytId ? youtubeThumb(ytId) : null)

  const startAt = start != null && start > 0 ? Math.floor(start) : 0
  const endAt = end != null && end > startAt ? Math.floor(end) : null

  // ── Poster (pre-play): imagen + botón play sobre el sport-glow del DS. ──
  const poster_ = (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setStarted(true)}
      accessibilityRole="button"
      accessibilityLabel={title ? `Reproducir ${title}` : 'Reproducir video'}
      className="w-full h-full items-center justify-center"
    >
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} />
      ) : null}
      <View style={[styles.playBtn, { backgroundColor: theme.primary }, GLOWS.sport]}>
        <Play size={26} color={theme.primaryForeground} fill={theme.primaryForeground} />
      </View>
    </TouchableOpacity>
  )

  return (
    <View
      className="bg-surface-sunken border border-subtle rounded-2xl overflow-hidden"
      style={[styles.frame, style]}
    >
      {!started ? (
        poster_
      ) : ytId ? (
        <WebView
          testID="video-player-webview"
          source={{
            html: youtubeEmbedHtml(ytId, { start: startAt, end: endAt, muted, loop, autoplay: true }),
            baseUrl: 'https://www.youtube-nocookie.com',
          }}
          style={styles.fill}
          // iOS: sin estas dos props el gesto del usuario NO llega al iframe y el
          // video queda congelado en el primer frame (bug reportado en TestFlight).
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo={false}
          // Android: capa hardware para que el <video> del iframe pinte (si no, negro).
          androidLayerType="hardware"
          // Evita que YouTube intente abrir el video en una ventana/app externa.
          setSupportMultipleWindows={false}
        />
      ) : isDirect && ExpoVideo ? (
        <DirectVideo url={url} start={startAt} end={endAt} muted={muted} loop={loop} />
      ) : (
        // expo-video aún no instalado (o URL no reconocida): degradar a abrir afuera.
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => Linking.openURL(url)}
          className="w-full h-full items-center justify-center"
        >
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <View style={[styles.playBtn, { backgroundColor: theme.primary }, GLOWS.sport]}>
            <Play size={26} color={theme.primaryForeground} fill={theme.primaryForeground} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * Reproductor de media directa (mp4/webm) vía expo-video. Solo se monta cuando
 * `ExpoVideo != null` (require exitoso), así el hook `useVideoPlayer` siempre corre
 * durante su ciclo de vida (regla de hooks). Loopea el tramo [start,end] con un
 * listener de tiempo (mismo comportamiento que la web con la IFrame API).
 */
function DirectVideo({
  url,
  start,
  end,
  muted,
  loop,
}: {
  url: string
  start: number
  end: number | null
  muted: boolean
  loop: boolean
}) {
  // ExpoVideo es no-null por el guard del padre.
  const mod = ExpoVideo as ExpoVideoModule
  const player = mod.useVideoPlayer(url, (p) => {
    p.loop = loop && end == null // con recorte, el loop lo maneja el listener
    p.muted = muted
    if (start > 0) p.currentTime = start
    p.play()
  })

  // Recorte del coach: al cruzar `end`, volver a `start` (loop del tramo).
  useEffect(() => {
    if (end == null) return
    const sub = player.addListener('timeUpdate', (payload) => {
      const t = payload.currentTime ?? player.currentTime
      if (t >= end) {
        player.currentTime = start
        if (loop) player.play()
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, start, end, loop])

  const { VideoView } = mod
  return <VideoView player={player} style={styles.fill} contentFit="contain" nativeControls={false} allowsFullscreen={false} />
}

/**
 * HTML del embed de YouTube para el WebView. Mismo contrato que la web
 * (`ExerciseVideo` / `exerciseEmbedUrl`): youtube-nocookie, sin controles/branding,
 * autoplay + mute + loop = GIF. La IFrame API loopea el recorte [start,end]:
 * al ENDED o al cruzar `end` hace seekTo(start).play() (degradación grácil — si la
 * API no carga, el iframe reproduce igual con loop nativo del video completo).
 */
function youtubeEmbedHtml(
  id: string,
  opts: { start: number; end: number | null; muted: boolean; loop: boolean; autoplay: boolean },
): string {
  const { start, end, muted, loop, autoplay } = opts
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>*{margin:0;padding:0}html,body{background:#000;height:100%;overflow:hidden}#p{width:100%;height:100%}iframe{width:100%;height:100%;border:0}</style>
</head><body><div id="p"></div>
<script>
  var START=${start}, END=${end == null ? 'null' : end}, LOOP=${loop ? 'true' : 'false'};
  var player, watchdog;
  function onYouTubeIframeAPIReady(){
    player=new YT.Player('p',{videoId:'${id}',playerVars:{
      autoplay:${autoplay ? 1 : 0},mute:${muted ? 1 : 0},controls:0,modestbranding:1,rel:0,
      playsinline:1,disablekb:1,iv_load_policy:3,fs:0,loop:${loop ? 1 : 0},playlist:'${id}',start:${start}
    },events:{
      // iOS/WKWebView ignora el playerVar autoplay: hay que arrancar a mano en onReady
      // (mute primero para respetar la policy de autoplay silencioso de iOS y Android).
      onReady:function(e){
        ${muted ? 'e.target.mute();' : ''}
        ${start > 0 ? `e.target.seekTo(START,true);` : ''}
        e.target.playVideo();
      },
      onStateChange:function(e){
        if(e.data===YT.PlayerState.ENDED && LOOP){e.target.seekTo(START,true);e.target.playVideo();}
      }
    }});
  }
  if(END!==null){
    watchdog=setInterval(function(){
      try{ if(player&&player.getCurrentTime&&player.getCurrentTime()>=END){player.seekTo(START,true);if(LOOP)player.playVideo();} }catch(_){}
    },300);
  }
  var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.body.appendChild(s);
</script></body></html>`
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9 },
  fill: { flex: 1, backgroundColor: '#000' },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
