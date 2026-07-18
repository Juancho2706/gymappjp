import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Linking, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { WebView } from 'react-native-webview'
import { Play } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { GLOWS } from '../lib/shadows'
import { extractYoutubeVideoId } from '../lib/youtube'

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
  /**
   * Renderiza el medio SIN chrome de tarjeta (sin borde ni radio), a sangre. Para superficies
   * cuyo origen web muestra el medio full-bleed sin borde ni esquinas — p.ej. el modal de técnica,
   * donde el `DialogContent p-0` deja el wrapper del medio pegado a los bordes sin borde ni radio
   * (WorkoutExecutionClient.tsx:2005 + :2016/2030/2048/2062). Default false (marco DS estándar).
   */
  frameless?: boolean
  /**
   * Color del letterbox (fondo detrás del video `object-contain`). Sin override (default) se conserva
   * el comportamiento actual: contenedor `bg-surface-sunken` + WebView/HTML `#000`, que espeja el
   * `bg-black` de los contenedores de video de la web. Se pasa BLANCO (`#ffffff` = --color-white,
   * global.css:39) en el caso mp4 del modal de técnica, donde la web fuerza `bg-white` en ambos temas
   * (WorkoutExecutionClient.tsx:2048). No es un token nuevo: es el canal DS blanco como color CSS del HTML.
   */
  letterbox?: string
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
  frameless = false,
  letterbox,
}: VideoPlayerProps) {
  const { theme } = useTheme()
  const [started, setStarted] = useState(autoPlay)

  const ytId = useMemo(() => extractYoutubeVideoId(url), [url])
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

  // Letterbox: cuando se pasa un color, sobreescribe el #000 baked del fill (y el bg-surface-sunken del
  // contenedor) para que el fondo detrás del `object-contain` iguale a la web (p.ej. blanco en mp4 del modal).
  const fillStyle = letterbox ? [styles.fill, { backgroundColor: letterbox }] : styles.fill

  // Modelo de altura del marco. Por defecto 16:9 (la altura DERIVA del ancho) — es el estándar DS para
  // previews de ejercicio (forms/catálogo del coach) y no se toca. PERO si el caller fija una `height`
  // explícita vía `style`, se descarta el `aspectRatio` para respetar esa ALTURA FIJA: el modal de técnica
  // pasa height 192/256 = web `h-48 md:h-64`, altura fija independiente del ancho con el medio `object-contain`
  // dentro (WorkoutExecutionClient.tsx:2016,2030,2048,2062). Sin el guard, RN sobre-restringiría el marco al
  // llevar width:100% + height + aspectRatio a la vez (el 16:9 daba ~219px en un phone de ~390px vs los 192px fijos).
  const hasFixedHeight = StyleSheet.flatten(style)?.height != null
  const frameSizing = hasFixedHeight ? styles.frameFluid : styles.frame

  return (
    <View
      className={`bg-surface-sunken overflow-hidden${frameless ? '' : ' border border-subtle rounded-2xl'}`}
      style={[frameSizing, letterbox ? { backgroundColor: letterbox } : null, style]}
    >
      {!started ? (
        poster_
      ) : ytId ? (
        <WebView
          testID="video-player-webview"
          accessibilityRole="image"
          accessibilityLabel={title ? `Video de ${title}` : 'Video del ejercicio'}
          source={{
            html: youtubeEmbedHtml(ytId, { start: startAt, end: endAt, muted, loop, autoplay: true }),
            baseUrl: 'https://www.youtube-nocookie.com',
          }}
          style={fillStyle}
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
        <DirectVideo url={url} start={startAt} end={endAt} muted={muted} loop={loop} letterbox={letterbox} />
      ) : isDirect ? (
        // expo-video aún no instalado: reproducción INLINE via WebView + HTML5 <video> — el MISMO
        // elemento `<video autoPlay loop muted playsInline object-contain>` que usa la web
        // (WorkoutExecutionClient.tsx:2049-2056), dentro del WebView que ya es dependencia (YouTube).
        // Reemplaza el antiguo `Linking.openURL` (sacaba al usuario fuera de la app) → paridad inline
        // sin depender de un módulo nativo. El recorte [start,end] se loopea igual que en DirectVideo.
        <WebView
          testID="video-player-direct-webview"
          accessibilityRole="image"
          accessibilityLabel={title ? `Video de ${title}` : 'Video del ejercicio'}
          source={{ html: directVideoHtml(url, { start: startAt, end: endAt, muted, loop, background: letterbox ?? '#000' }) }}
          style={fillStyle}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo={false}
          androidLayerType="hardware"
          setSupportMultipleWindows={false}
        />
      ) : (
        // URL no reconocida (ni YouTube ni media directa http/s): degradar a abrir afuera.
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
  letterbox,
}: {
  url: string
  start: number
  end: number | null
  muted: boolean
  loop: boolean
  letterbox?: string
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
  return (
    <VideoView
      player={player}
      style={letterbox ? [styles.fill, { backgroundColor: letterbox }] : styles.fill}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
    />
  )
}

/**
 * HTML del embed de YouTube para el WebView. Mismo contrato que la web
 * (`ExerciseVideo.tsx:50-57,113-124`): el `<iframe>` de youtube-nocookie se renderiza SIEMPRE en
 * el HTML con `autoplay=1&mute=1&loop=1&playlist=<id>` NATIVO (sin controles/branding = GIF), así
 * que si la IFrame API JS no carga (red/bloqueo) el iframe reproduce igual con loop nativo del video
 * completo — degradación grácil, nunca queda una caja negra (contrato §3a). La API JS SOLO se ATACHA
 * al iframe ya presente (`enablejsapi=1`, `new YT.Player('p',{events})` como la web
 * `ExerciseVideo.tsx:72`) para: (a) loopear el recorte [start,end] — ENDED / watchdog al cruzar `end`
 * → seekTo(start).play(); (b) empujar el play en iOS/WKWebView, que a veces ignora el autoplay nativo.
 */
function youtubeEmbedHtml(
  id: string,
  opts: { start: number; end: number | null; muted: boolean; loop: boolean; autoplay: boolean },
): string {
  const { start, end, muted, loop, autoplay } = opts
  // URL del iframe = espejo de la web (ExerciseVideo.tsx:51-57): playlist=id para que el loop nativo
  // funcione; enablejsapi=1 para poder ATACHAR la API al iframe existente.
  const params = [
    `autoplay=${autoplay ? 1 : 0}`,
    `mute=${muted ? 1 : 0}`,
    `loop=${loop ? 1 : 0}`,
    `playlist=${id}`,
    'controls=0', 'modestbranding=1', 'rel=0', 'playsinline=1',
    'disablekb=1', 'iv_load_policy=3', 'fs=0', 'enablejsapi=1',
  ]
  if (start > 0) params.push(`start=${start}`)
  const src = `https://www.youtube-nocookie.com/embed/${id}?${params.join('&')}`
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>*{margin:0;padding:0}html,body{background:#000;height:100%;overflow:hidden}#p{width:100%;height:100%;border:0}</style>
</head><body>
<iframe id="p" src="${src}" allow="autoplay; encrypted-media; picture-in-picture; web-share" allowfullscreen="false"></iframe>
<script>
  var START=${start}, END=${end == null ? 'null' : end}, LOOP=${loop ? 'true' : 'false'};
  var player, watchdog;
  // ATACHA la API al iframe YA renderizado (no crea uno nuevo): mismo patrón que la web
  // (new YT.Player(frameId,{events}), ExerciseVideo.tsx:72). Si este script no llega a cargar,
  // el iframe de arriba ya está reproduciendo con loop nativo (degradación grácil).
  function onYouTubeIframeAPIReady(){
    player=new YT.Player('p',{events:{
      // iOS/WKWebView a veces ignora el autoplay nativo: reforzamos el play en onReady
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

/**
 * HTML del `<video>` HTML5 directo (mp4/webm/mov/Storage) para el WebView. Espejo EXACTO del
 * elemento de la web (`WorkoutExecutionClient.tsx:2049-2056`): `autoplay loop muted playsinline
 * object-fit:contain`. El fondo (letterbox) es `#000` por defecto — espeja el `bg-black` de los
 * contenedores web — o el color que pase `background` (blanco en el mp4 del modal de técnica, donde la
 * web fuerza `bg-white`, WorkoutExecutionClient.tsx:2048). Si el coach recortó `[start,end]`, un listener `timeupdate`
 * vuelve a `start` al cruzar `end` (mismo truco que `DirectVideo`/la IFrame API de YouTube). La
 * `url` se inyecta con `JSON.stringify` (evita romper el HTML con comillas en la query string).
 */
function directVideoHtml(
  url: string,
  opts: { start: number; end: number | null; muted: boolean; loop: boolean; background: string },
): string {
  const { start, end, muted, loop, background } = opts
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>*{margin:0;padding:0}html,body{background:${background};height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:${background}}</style>
</head><body>
<video id="v" ${loop ? 'loop' : ''} ${muted ? 'muted' : ''} autoplay playsinline webkit-playsinline></video>
<script>
  var START=${start}, END=${end == null ? 'null' : end}, LOOP=${loop ? 'true' : 'false'};
  var v=document.getElementById('v');
  ${muted ? 'v.muted=true;' : ''}
  v.src=${JSON.stringify(url)};
  if(START>0){v.addEventListener('loadedmetadata',function(){try{v.currentTime=START}catch(_){}});}
  if(END!==null){v.addEventListener('timeupdate',function(){if(v.currentTime>=END){v.currentTime=START;if(LOOP){var p=v.play();if(p&&p.catch)p.catch(function(){});}}});}
  var pr=v.play();if(pr&&pr.catch)pr.catch(function(){});
</script></body></html>`
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9 },
  // Marco cuando el caller impone una `height` fija (p.ej. el modal de técnica con `h-48 md:h-64`):
  // solo ancho full; la altura la aporta el `style` del caller, sin `aspectRatio` que compita.
  frameFluid: { width: '100%' },
  fill: { flex: 1, backgroundColor: '#000' },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
