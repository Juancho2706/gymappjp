import { useEffect, useState } from 'react'
import { Modal, Pressable, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { Maximize2, X } from 'lucide-react-native'
// Importar Sheet registra su cssInterop(X) (className→color), así la X de abajo colorea con text-*.
import { Sheet } from '../../Sheet'
import { VideoPlayer } from '../../VideoPlayer'
import { FONT, textStyle } from '../../../lib/typography'
import { hexToRgba } from '../../../lib/theme'
import { extractYoutubeVideoId } from '../../../lib/youtube'
import type { SessionExercise } from '../../../lib/workout-session'

// Letterbox OSCURO del medio en modo V3 (informe 15, BLOCKER): el ejecutor V3 es dark-only, el medio
// no debe abrir en blanco sobre el shell oscuro. #050507 = piso casi-negro del mockup a3a-splash.
const V3_LETTERBOX = '#050507'

/**
 * Estilo del nombre del ejercicio reubicado bajo el medio (§4): idéntico al que el Sheet aplica a su
 * cabecera en `titleSize='xl'` (Sheet.tsx:107-110) = web `DialogTitle text-xl font-extrabold` +
 * base uppercase/tracking-tighter Montserrat→display (dialog.tsx:126-127, WorkoutExecutionClient.tsx:2079).
 */
const techniqueTitleStyle = {
  ...textStyle('xl', FONT.displayBold, { lh: 'snug', ls: 'tighter' }),
  textTransform: 'uppercase' as const,
}

/**
 * Modal de técnica (mobile). Video INLINE via `VideoPlayer` (YouTube/mp4) o gif/imagen, +
 * instrucciones numeradas + botón "Entendido". Espeja el modal de técnica de web
 * (`WorkoutExecutionClient.tsx:2001-2113`) sin salir de la app (reemplaza el `Linking.openURL`
 * del legacy). Adaptación idiomática: Dialog centrado → BottomSheet (swipe/backdrop del `Sheet`
 * cubren 2 de las 3 vías de cierre de la web; la X y "Entendido" cubren la tercera). Orden vertical
 * = web: [MEDIO full-bleed] → [nombre + X] → [instrucciones] → [Entendido]. El nombre va en el
 * CUERPO bajo el medio (no en la cabecera del Sheet) para espejar el DialogHeader debajo del medio
 * (medio :2007-2075 → nombre :2076-2084); por eso el Sheet va sin `title` y con `showCloseButton={false}`.
 *
 * Bloque de medio — MISMA prioridad estricta que la web (`WorkoutExecutionClient.tsx:2007-2074`):
 *   1. YouTube (video_url youtube + id válido) → VideoPlayer (autoplay/mute/loop = GIF; recorta [start,end]).
 *   2. gif_url → imagen contain.
 *   3. video_url no-YouTube → mp4/mov/webm/Storage → VideoPlayer directo (loop completo, sin recorte,
 *      igual que el `<video loop>` de la web); cualquier otro → imagen.
 *   4. sin medio → nada.
 */

/**
 * Marco de altura FIJA para gif/imagen — SIN chrome de tarjeta (sin borde ni radio), a sangre: el medio del
 * modal web es full-bleed bajo `DialogContent p-0`, el gif usa `bg-muted` sin borde ni radio y el
 * fallback de imagen `bg-white border-b` sin radio (WorkoutExecutionClient.tsx:2005,2030,2062).
 * `height` es la ALTURA FIJA del contenedor = web `h-48 md:h-64` (192/256px), independiente del ancho,
 * con el medio `object-contain` centrado dentro (WorkoutExecutionClient.tsx:2030,2062). Antes se derivaba
 * de `aspectRatio:16/9`, que en un phone full-bleed (~390px) daba ~219px (~27px de más) y divergía más en tablets.
 * `padded` inset el medio 16px dentro del marco = web gif `object-contain p-4`
 * (WorkoutExecutionClient.tsx:2035, p-4 = 16px = space-5). El fallback de imagen del web
 * (video_url no-YouTube/no-mp4, :2067) NO lleva padding, así que ese caso pasa `padded={false}`.
 * El bleed lateral (fuera del padding del scroll) lo aplica el envoltorio en `TechniqueSheet`.
 */
function MediaImage({ uri, padded = false, height, v3 = false }: { uri: string; padded?: boolean; height: number; v3?: boolean }) {
  // gif (padded): letterbox `bg-surface-sunken` = web `bg-muted` (WorkoutExecutionClient.tsx:2030) — en paridad.
  // imagen-fallback (no padded): letterbox BLANCO + hairline inferior = web `bg-white border-b border-border/50`
  // (:2062, con `--border` = `--border-subtle`, globals.css:235). El blanco forzado en ambos temas se espeja con
  // `bg-white` (--color-white, global.css:39) y el hairline con `border-subtle` (el token ya trae el alpha horneado
  // por modo; el modificador /50 dejó de aplicar al pasar el token a var() — ver tailwind.config.js borderColor).
  // V3 (informe 15): ambos letterboxes van a OSCURO (#050507) — el ejecutor V3 es dark-only.
  if (v3) {
    return (
      <View className="overflow-hidden" style={{ width: '100%', height, backgroundColor: V3_LETTERBOX, padding: padded ? 20 : 0 }}>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
      </View>
    )
  }
  return (
    <View
      className={`overflow-hidden ${padded ? 'bg-surface-sunken p-space-5' : 'border-b border-subtle bg-white'}`}
      style={{ width: '100%', height }}
    >
      <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
    </View>
  )
}

/** Decide el medio a renderizar espejando el orden de prioridad de la web (§3). */
function TechniqueMedia({ exercise, v3 = false }: { exercise: SessionExercise; v3?: boolean }) {
  const { width } = useWindowDimensions()
  // Altura FIJA del medio = web `h-48 md:h-64` (Tailwind 4px grid: 48·4=192 / 64·4=256px). Los CUATRO
  // contenedores del medio del modal web usan esta altura fija INDEPENDIENTE del ancho, con el medio
  // `object-contain` centrado dentro (WorkoutExecutionClient.tsx:2016,2030,2048,2062). ≥md (tablet/landscape,
  // breakpoint 768 de Tailwind) sube a 256 igual que el `md:` del web. No es un valor nuevo: es el mismo token
  // `h-48`/`h-64` de la escala Tailwind (misma grilla de 4px del DS) que compila el web, no `aspectRatio:16/9`.
  const mediaHeight = width >= 768 ? 256 : 192
  const videoUrl = exercise.video_url
  // Detección idéntica a la web (WorkoutExecutionClient.tsx:2010-2012): substring + extractor robusto.
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  // 1) YouTube — recorta el tramo [start,end] del coach.
  if (isYouTube && ytId && videoUrl) {
    return (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        frameless
        // Altura FIJA = web `h-48 md:h-64` (:2016), no el 16:9 derivado del ancho.
        style={{ height: mediaHeight }}
        title={exercise.name}
      />
    )
  }

  // 2) gif — inset 16px como el web (`object-contain p-4`, :2035).
  if (exercise.gif_url) {
    return <MediaImage uri={exercise.gif_url} padded height={mediaHeight} v3={v3} />
  }

  // 3) video_url no-YouTube: mp4/mov/webm/Storage → video directo; resto → imagen.
  if (videoUrl) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') ||
      u.includes('.mov') ||
      u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    // La web reproduce el mp4 con `<video loop>` SIN recorte → no pasamos start/end (loop completo).
    // Letterbox BLANCO + hairline inferior = web mp4 `bg-white border-b border-border/50` (:2048), blanco
    // forzado en ambos temas. `letterbox="#ffffff"` pinta el fondo del video (contenedor + WebView/HTML) de
    // blanco en vez del #000 por defecto; el `#fff` = --color-white (global.css:39), patrón hex-que-coincide-
    // con-canal-DS documentado. El `border-b border-subtle` (hairline con alpha horneado en el token) va en el envoltorio.
    if (isMp4) {
      // V3 (informe 15): letterbox OSCURO (#050507) sin hairline claro; V2 conserva el blanco byte-idéntico.
      return (
        <View className={v3 ? 'overflow-hidden' : 'border-b border-subtle bg-white'} style={v3 ? { backgroundColor: V3_LETTERBOX } : undefined}>
          {/* Altura FIJA = web `h-48 md:h-64` (:2048), no el 16:9 derivado del ancho. */}
          <VideoPlayer url={videoUrl} autoPlay frameless letterbox={v3 ? V3_LETTERBOX : '#ffffff'} style={{ height: mediaHeight }} title={exercise.name} />
        </View>
      )
    }
    return <MediaImage uri={videoUrl} height={mediaHeight} v3={v3} />
  }

  // 4) sin medio.
  return null
}

/**
 * Media a PANTALLA COMPLETA para el lightbox (QA4 · hallazgo CEO): misma precedencia que `TechniqueMedia`,
 * pero dimensionada al ancho de la ventana y centrada. gif/imagen `contain`, video/YouTube via `VideoPlayer`.
 */
function LightboxMedia({ exercise }: { exercise: SessionExercise }) {
  const { width, height } = useWindowDimensions()
  const boxW = Math.round(width * 0.94)
  const boxH = Math.round(Math.min(height * 0.7, (boxW * 9) / 16))
  const videoUrl = exercise.video_url
  const isYouTube = !!videoUrl && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))
  const ytId = videoUrl ? extractYoutubeVideoId(videoUrl) : null

  if (isYouTube && ytId && videoUrl) {
    return (
      <VideoPlayer
        url={videoUrl}
        start={exercise.video_start_time}
        end={exercise.video_end_time}
        autoPlay
        frameless
        letterbox={V3_LETTERBOX}
        style={{ width: boxW, height: boxH }}
        title={exercise.name}
      />
    )
  }
  if (exercise.gif_url) {
    return (
      <View style={{ width: boxW, height: boxH, backgroundColor: V3_LETTERBOX }}>
        <Image source={{ uri: exercise.gif_url }} style={{ flex: 1 }} contentFit="contain" />
      </View>
    )
  }
  if (videoUrl) {
    const u = videoUrl.toLowerCase()
    const isMp4 =
      u.includes('.mp4') ||
      u.includes('.mov') ||
      u.includes('.webm') ||
      (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
    if (isMp4) {
      return <VideoPlayer url={videoUrl} autoPlay frameless letterbox={V3_LETTERBOX} style={{ width: boxW, height: boxH }} title={exercise.name} />
    }
    return (
      <View style={{ width: boxW, height: boxH, backgroundColor: V3_LETTERBOX }}>
        <Image source={{ uri: videoUrl }} style={{ flex: 1 }} contentFit="contain" />
      </View>
    )
  }
  return null
}

export function TechniqueSheet({
  exercise,
  onClose,
  v3 = false,
  accent,
}: {
  exercise: SessionExercise | null
  onClose: () => void
  /** Modo ejecutor V3 (informe 15, BLOCKER): superficie/medio OSCUROS (dark-only), no el sheet claro. */
  v3?: boolean
  /** Acento de MARCA para el badge numérico en V3 (cae a sport-500 si no viaja). */
  accent?: string
}) {
  const open = !!exercise
  const steps = exercise?.instructions ?? null
  const hasMedia = !!(exercise?.gif_url || exercise?.video_url)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // El lightbox no debe sobrevivir al cierre/cambio de ejercicio (el estado persiste entre aperturas).
  useEffect(() => {
    setLightboxOpen(false)
  }, [exercise?.id])

  return (
    <>
    <Sheet
      open={open}
      onClose={onClose}
      forceDark={v3}
      // Sin título en la cabecera del Sheet: la web muestra el nombre del ejercicio DEBAJO del medio,
      // no encima (medio :2007-2075 → DialogHeader con el nombre :2076-2084). Lo renderizamos como
      // primer contenido del cuerpo (bajo el medio) para espejar ese orden. showCloseButton={false}
      // = la web también apaga la X del contenedor (DialogContent showCloseButton={false}, :2004) y
      // dibuja su propia X junto al título; aquí hacemos igual (swipe/backdrop siguen cerrando).
      showCloseButton={false}
      // Nombre del ejercicio como accessible name del sheet (lo daba el título del header antes).
      accessibilityLabel={exercise?.name}
      // QA-12 (ronda 7): `nativeModal` renderiza vía `<Modal>` RN en vez de @gorhom. La técnica NO abría el
      // modal de multimedia en release: bajo @gorhom 5.2.14 (reanimated 3) + reanimated 4.1.7 + Fabric el
      // hosting-container siembra su alto en -999 hasta un commit `.modify()` que no propaga a tiempo y
      // `enableDynamicSizing` mide ~0 (QA-7). El `<Modal>` nativo content-hugea solo (patrón del KeypadHost);
      // `snapPoints={['90%']}` es el tope de max-height (paridad con el DialogContent web `h-auto max-h`).
      nativeModal
      snapPoints={['90%']}
      // El medio (índice 0) queda FIJADO fuera del scroll = web `shrink-0` fuera de la zona
      // `overflow-y-auto` (WorkoutExecutionClient.tsx:2015/2030/2048/2062 vs :2076): el gif/video
      // permanece a la vista mientras las instrucciones scrollean. Su marco lleva fondo opaco
      // (VideoPlayer / MediaImage bg-surface-sunken), requisito de stickyHeaderIndices.
      stickyHeaderIndices={[0]}
    >
      {/* `-mx-space-6` cancela el `paddingHorizontal:20` (=space-6) del BottomSheetScrollView
          (Sheet.tsx:219) → el medio llega a los bordes del sheet, espejando el medio full-bleed
          del modal web (DialogContent `p-0`, WorkoutExecutionClient.tsx:2005). */}
      {exercise ? (
        <View className="-mx-space-6">
          <TechniqueMedia exercise={exercise} v3={v3} />
          {/* Ampliar multimedia (QA4) — botón glass esquina superior-derecha → lightbox a pantalla completa. */}
          {hasMedia && (
            <TouchableOpacity
              onPress={() => setLightboxOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Ampliar multimedia"
              hitSlop={8}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 34,
                height: 34,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(8,8,12,0.6)',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <Maximize2 size={16} color="#eaeaf0" />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Nombre + X DEBAJO del medio — espejo del DialogHeader web (WorkoutExecutionClient.tsx:2077-2084):
          nombre en display xl extrabold uppercase tracking-tighter, color `text-foreground` que en el DS web
          resuelve a `--text-body` (= ink-800), NO a text-strong/ink-950 (globals.css:209 `--foreground:
          var(--text-body)`, :401 `--text-body: var(--ink-800)`); por eso el Text usa `text-body`. La X
          (w-5 h-5 text-muted-foreground, botón p-2 -mr-2 -mt-2 rounded-full) cierra el modal. `mt-space-3`
          (8px) sube el gap uniforme (14px) del BottomSheetScrollView (Sheet.tsx:219) hacia el ~24px
          medio→nombre del web (p-6 top del cuerpo scrolleable, WorkoutExecutionClient.tsx:2076). Sin
          `numberOfLines`: el DialogTitle web NO clampa, el nombre envuelve completo (:2079). */}
      <View className="mt-space-3 flex-row items-start justify-between gap-space-4">
        <Text style={techniqueTitleStyle} className={`flex-1 ${v3 ? 'text-on-dark' : 'text-body'}`}>
          {exercise?.name ?? 'Técnica'}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={8}
          className="-mr-space-3 -mt-space-3 rounded-pill p-space-3"
        >
          <X className={v3 ? 'text-on-dark-muted' : 'text-muted'} size={20} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {steps && steps.length > 0 ? (
        <View className="gap-3">
          {steps.map((step, i) => (
            <View key={`${i}-${step}`} className="flex-row items-start gap-3">
              {/* Badge numérico — espejo de la web (§5): círculo sport-500 @15%, número sport-500 bold,
                  size 'xs' (13px) = web span `text-xs` (globals.css:455 `--text-xs: 13px`,
                  WorkoutExecutionClient.tsx:2090). mt-0.5 (2px) iguala el `mt-0.5` del span web (:2090)
                  para el mismo alineado vertical. */}
              {/* V3 (informe 15): el badge adopta la MARCA (accent @15% + número accent), no azul Sport fijo. */}
              <View
                className={v3 ? 'mt-0.5 h-6 w-6 items-center justify-center rounded-full' : 'mt-0.5 h-6 w-6 items-center justify-center rounded-full bg-sport-500/15'}
                style={v3 && accent ? { backgroundColor: hexToRgba(accent, 0.15) } : undefined}
              >
                <Text style={[textStyle('xs', FONT.uiBold), v3 && accent ? { color: accent } : undefined]} className={v3 ? undefined : 'text-sport-500'}>
                  {i + 1}
                </Text>
              </View>
              {/* 14px = web `text-sm` + `leading-relaxed` (WorkoutExecutionClient.tsx:2088,2098);
                  color text-muted = web text-muted-foreground. Un solo tamaño (sin mezclar TYPE.body/text-[13px]). */}
              <Text style={textStyle('sm', FONT.ui, { lh: 'relaxed' })} className={`flex-1 ${v3 ? 'text-on-dark-muted' : 'text-muted'}`}>
                {step.replace(/^Step:\d+\s*/i, '')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={textStyle('sm', FONT.ui)} className={v3 ? 'text-on-dark-muted' : 'text-muted'}>
          {/* Sin text-center: el web lo alinea a la izquierda (WorkoutExecutionClient.tsx:2103,
              <p> sin text-align). */}
          No hay instrucciones detalladas disponibles para este ejercicio.
        </Text>
      )}

      {/* "Entendido" (§6): cierra el modal. bg-secondary/text-secondary-foreground de la web =
          surface-sunken / text-body (globals.css:222-223). Sin toast/haptic/navegación.
          `mt-space-3` (8px) sobre el gap uniforme (14px) del scroll (Sheet.tsx:219) ≈ 22px, acercándose
          al `mt-6` (24px) pasos→botón del web (WorkoutExecutionClient.tsx:2107) sin el ~38px previo
          (14 gap + 24 mt), reproduciendo el ritmo grande/pequeño/grande (24/16/24) del web. */}
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        className={`mt-space-3 w-full items-center justify-center rounded-control py-3 ${v3 ? 'border border-inverse/10 bg-white/[0.06]' : 'bg-surface-sunken'}`}
      >
        {/* 16px bold: el <button> web no fija tamaño de texto → por el preflight de Tailwind
            (button { font-size: 100% }) hereda el 1rem/16px del body (WorkoutExecutionClient.tsx:2107,
            sin utilidad text-*), 2px por encima de los pasos (text-sm/14px) para conservar la
            jerarquía del CTA primario. `md` = 16px del DS (typography.ts:53), equivalente a --text-base. */}
        <Text style={textStyle('md', FONT.uiBold)} className={v3 ? 'text-on-dark' : 'text-body'}>
          Entendido
        </Text>
      </TouchableOpacity>
    </Sheet>

    {/* Lightbox de multimedia a pantalla completa (QA4 · hallazgo CEO): fondo oscuro, media centrada
        grande, X y tap-al-fondo para cerrar. Modal RN independiente del Sheet. */}
    <Modal visible={lightboxOpen} transparent animationType="fade" onRequestClose={() => setLightboxOpen(false)}>
      <Pressable
        onPress={() => setLightboxOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Cerrar multimedia"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {/* Absorbe el tap sobre la media para que NO cierre (sólo el fondo cierra). */}
        <Pressable onPress={() => {}}>{exercise ? <LightboxMedia exercise={exercise} /> : null}</Pressable>
        <TouchableOpacity
          onPress={() => setLightboxOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 44,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(8,8,12,0.6)',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.2)',
          }}
        >
          <X size={22} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    </Modal>
    </>
  )
}
