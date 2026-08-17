import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import type { LayoutRectangle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { useTheme } from '../../../context/ThemeContext'
import { EASE, useEvaMotion } from '../../../lib/motion'
import { hasSeenTour, markTourSeen } from './tour-flags'
import { useTourTargets, type TourRect } from './TourTargets'
import { tourIconSource, type TourId, type TourStep } from './tours'

/**
 * Motor de la Guía Viva en RN (SPEC `nutrition-onboarding-tour`, D3 + D5) — el spotlight de
 * onboarding de Nutrición para el teléfono. Espejo de
 * `apps/web/src/components/nutrition-v2/tour/tour-engine.tsx`.
 *
 * Un motor propio y no una librería (D1): el contrato es chico, ninguna lib de tour web cubre RN, y
 * el espejo nativo tiene que comportarse igual que el web. Cero dependencias nuevas — `Modal`,
 * `expo-image`, `moti` y `lucide-react-native` ya estaban.
 *
 * Anatomía de un paso (D5):
 *   4 Views oscuras + halo → el recorte vivo sobre el target (medido con `measureInWindow`)
 *   tarjeta dock           → ícono clay 22 px + título + cuerpo + dots + ← → + «Saltar» + n/N
 *
 * Tres cosas se resuelven distinto que en web, y ninguna es estética:
 *
 * - **La UI de abajo queda inerte GRATIS.** En web hay que poner `pointer-events` en los paños y en
 *   el halo para que el coach no dispare una acción real en medio del tour; acá el `Modal` vive en
 *   su propia ventana del sistema y nada de lo que hay detrás recibe toques.
 * - **La tarjeta es SIEMPRE dock** (SPEC D3: «En <768 (web) y RN SIEMPRE variante dock»), así que no
 *   hay clamp+flip que calcular: anclada con `left`/`right`/`bottom` y con techo de alto, el
 *   invariante «tarjeta ⊆ viewport» se cumple por construcción y no por aritmética.
 * - **No hay `scrollIntoView`.** No existe en RN y no hace falta: la tarjeta no persigue al target,
 *   y un target fuera de vista degrada al velo liso (el mismo degradado que web usa cuando el
 *   `data-tour` no existe en ese breakpoint).
 */

/* ------------------------------------------------------------------------------------------------
 * Constantes de pintura
 * ---------------------------------------------------------------------------------------------- */

/**
 * Velo al 74% (D5, número del dueño). Es el mismo negro en los dos temas a propósito: no atenúa el
 * fondo, lo APAGA — el foco de un spotlight no cambia con el tema. No usa el token
 * `--surface-overlay` (0,55 / 0,62) porque ese sirve a los modales, que sí atenúan.
 */
const TOUR_VEIL = 'rgba(0, 0, 0, 0.74)'

/** Blanco del halo. Literal a propósito, por lo mismo que el velo: el recorte no es white-label. */
const TOUR_HALO_RING = 'rgba(255, 255, 255, 0.85)'
const TOUR_HALO_GLOW = 'rgba(255, 255, 255, 0.14)'

/** Aire alrededor del target dentro del recorte (mismo valor que `TOUR_HOLE_PADDING` en web). */
const HOLE_PADDING = 6

/** Margen mínimo de la tarjeta contra los bordes. Es el colchón que hace verdadero a D3. */
const CARD_MARGIN = 12

export const TOUR_COPY = {
  skip: 'Saltar',
  done: 'Listo',
  prev: 'Paso anterior',
  next: 'Paso siguiente',
  /** Nombre accesible del «?» (D2). No es copy de guion: es la etiqueta del control. */
  help: 'Abrir la guía de esta pantalla',
  dialog: 'Guía de esta pantalla',
} as const

/* ------------------------------------------------------------------------------------------------
 * Geometría
 * ---------------------------------------------------------------------------------------------- */

type Frame = {
  /** Origen de la ventana del `Modal` en coordenadas de ventana de la app. */
  readonly originX: number
  readonly originY: number
  readonly width: number
  readonly height: number
}

/**
 * El target se mide en coordenadas de VENTANA y los paños se pintan dentro del overlay. Los dos
 * orígenes coinciden casi siempre (el `Modal` va `statusBarTranslucent`), pero «casi siempre» no es
 * una base para un invariante: se mide también el propio overlay y se resta. Así el recorte cae
 * sobre el elemento correcto aunque el sistema meta un offset (barra de estado opaca, ventana del
 * modal desplazada), sin un solo número mágico por plataforma.
 */
function toOverlaySpace(target: TourRect, frame: Frame): TourRect {
  return {
    top: target.top - frame.originY,
    left: target.left - frame.originX,
    width: target.width,
    height: target.height,
  }
}

/**
 * Infla el target por `padding` y lo recorta al overlay: un target medio fuera de la pantalla no
 * saca el velo por el borde.
 *
 * `null` cuando el recorte queda degenerado — o sea, cuando el target está ENTERAMENTE fuera de
 * vista (la lista lo dejó arriba o abajo del scroll). Sin esta salida el halo se dibujaría como una
 * raya de 0 px pegada a un borde, que se lee como un artefacto y no como «este elemento no está a la
 * vista»; con ella, el paso degrada al mismo velo liso que un target inexistente.
 */
function inflateAndClamp(target: TourRect, frame: Frame): TourRect | null {
  const top = Math.max(0, target.top - HOLE_PADDING)
  const left = Math.max(0, target.left - HOLE_PADDING)
  const right = Math.min(frame.width, target.left + target.width + HOLE_PADDING)
  const bottom = Math.min(frame.height, target.top + target.height + HOLE_PADDING)
  const width = right - left
  const height = bottom - top
  return width > 0 && height > 0 ? { top, left, width, height } : null
}

/**
 * Los 4 paños. Su unión cubre el overlay entero menos el recorte. Sin hueco (target ausente o no
 * medible) el recorte queda en 0×0 arriba a la izquierda y el paño inferior crece hasta taparlo
 * todo: el paso se ve como un velo liso con la tarjeta abajo, que es el degradado correcto para un
 * elemento que esta pantalla no tiene.
 */
function panesFor(hole: TourRect, frame: Frame): Record<'top' | 'bottom' | 'left' | 'right', TourRect> {
  const holeRight = hole.left + hole.width
  const holeBottom = hole.top + hole.height
  return {
    top: { top: 0, left: 0, width: frame.width, height: hole.top },
    bottom: {
      top: holeBottom,
      left: 0,
      width: frame.width,
      height: Math.max(0, frame.height - holeBottom),
    },
    left: { top: hole.top, left: 0, width: hole.left, height: hole.height },
    right: {
      top: hole.top,
      left: holeRight,
      width: Math.max(0, frame.width - holeRight),
      height: hole.height,
    },
  }
}

const EMPTY_HOLE: TourRect = { top: 0, left: 0, width: 0, height: 0 }

/* ------------------------------------------------------------------------------------------------
 * TourOverlay
 * ---------------------------------------------------------------------------------------------- */

export type TourEndReason = 'done' | 'skip'

export type TourOverlayProps = {
  /** El guion (ver `tours.ts`). Debe tener al menos un paso. */
  steps: readonly TourStep[]
  active: boolean
  /** «Listo» manda `done`; «Saltar» y el back de Android mandan `skip`. Los dos marcan (D4). */
  onEnd: (reason: TourEndReason) => void
}

export function TourOverlay({ steps, active, onEnd }: TourOverlayProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const targets = useTourTargets()

  const [index, setIndex] = useState(0)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [hole, setHole] = useState<TourRect | null>(null)
  const rootRef = useRef<View | null>(null)

  const total = steps.length
  const step = steps[Math.min(index, Math.max(0, total - 1))]
  const isLast = index >= total - 1

  // Cada apertura empieza en el paso 1 (D4: el «?» REPITE el tour entero, no lo reanuda). Al cerrar
  // se olvida el recorte: si no, la próxima apertura pintaría por un frame el hueco del ÚLTIMO paso
  // de la vez anterior, sobre un elemento que ya no es el que se está enseñando.
  useEffect(() => {
    if (active) {
      setIndex(0)
      return
    }
    setHole(null)
  }, [active])

  /**
   * El overlay se mide a sí mismo en coordenadas de ventana. `onLayout` avisa cuándo el árbol
   * nativo ya existe; `measureInWindow` es lo único que da el ORIGEN (el layout solo da el tamaño y
   * la posición relativa al padre, que acá siempre es 0,0 y no sirve para restar).
   */
  const handleRootLayout = useCallback((layout: LayoutRectangle) => {
    const node = rootRef.current
    if (!node) return
    node.measureInWindow((x, y, width, height) => {
      const originX = Number.isFinite(x) ? x : 0
      const originY = Number.isFinite(y) ? y : 0
      setFrame({
        originX,
        originY,
        // El layout es la verdad sobre el TAMAÑO del overlay; la medición en ventana puede llegar
        // recortada en Android cuando la ventana del modal todavía se está acomodando.
        width: layout.width > 0 ? layout.width : width,
        height: layout.height > 0 ? layout.height : height,
      })
    })
  }, [])

  /**
   * Entrada a un paso: medir el target y recortar el velo. Cambia con el paso y con el frame, así
   * que una rotación de pantalla (que re-dispara `onLayout`) vuelve a medir sola.
   */
  useEffect(() => {
    if (!active || !step || !frame) return
    let cancelled = false
    void targets?.measureTarget(step.target).then((rect) => {
      if (cancelled) return
      setHole(rect ? inflateAndClamp(toOverlaySpace(rect, frame), frame) : null)
    })
    if (!targets) setHole(null)
    return () => {
      cancelled = true
    }
  }, [active, step, frame, targets])

  const goNext = useCallback(() => {
    setIndex((current) => (current >= total - 1 ? current : current + 1))
  }, [total])

  const goPrev = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  if (!step) return null

  const safeFrame: Frame = frame ?? { originX: 0, originY: 0, width: 0, height: 0 }
  const panes = panesFor(hole ?? EMPTY_HOLE, safeFrame)
  const transition = { type: 'timing', duration: motion.duration('base'), easing: EASE.out } as const

  // Techo de alto de la tarjeta (D3). Si el contenido no cabe, scrollea ADENTRO en vez de
  // desbordar: una tarjeta más alta que la pantalla no puede ser ⊆ viewport de ninguna otra forma.
  const cardBottom = Math.max(insets.bottom, CARD_MARGIN)
  const cardMaxHeight = Math.max(
    0,
    safeFrame.height - insets.top - CARD_MARGIN - cardBottom - CARD_MARGIN,
  )

  return (
    <Modal
      transparent
      visible={active}
      // Sin animación con «reducir movimiento» (D5). El fade del sistema es lo único que se anima
      // en la entrada; entre pasos anima la geometría de los paños (abajo).
      animationType={motion.reduced ? 'none' : 'fade'}
      // Obligatorio: sin esto, en Android la ventana del modal arranca bajo la barra de estado y el
      // recorte quedaría corrido respecto de lo que el coach ve. Mismo criterio que `Sheet.tsx`.
      statusBarTranslucent
      // Back de Android = Saltar (D5: «el tour jamás bloquea la salida»).
      onRequestClose={() => onEnd('skip')}
    >
      <View
        ref={rootRef}
        collapsable={false}
        onLayout={(event) => handleRootLayout(event.nativeEvent.layout)}
        style={{ flex: 1 }}
      >
        {(['top', 'bottom', 'left', 'right'] as const).map((pane) => (
          <MotiView
            key={pane}
            animate={panes[pane]}
            transition={transition}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', backgroundColor: TOUR_VEIL }}
          />
        ))}

        {/* Halo: el borde del recorte. Decorativo — acá no necesita bloquear toques (el Modal ya
            los bloquea todos), a diferencia del halo web. */}
        {hole ? (
          <MotiView
            animate={hole}
            transition={transition}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              borderRadius: 14,
              borderWidth: 2,
              borderColor: TOUR_HALO_RING,
              // Equivalente del `box-shadow: 0 0 0 6px` de web: RN no apila anillos, así que el
              // resplandor se dibuja con la sombra nativa (en Android `elevation` no colorea, así
              // que el anillo de 2 px es lo que sostiene la lectura en las dos plataformas).
              shadowColor: TOUR_HALO_GLOW,
              shadowOpacity: 1,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        ) : null}

        {/* Tarjeta dock (D3): anclada abajo a lo ancho, en la thumb-zone y sobre el área segura. */}
        <View
          accessibilityViewIsModal
          accessibilityLabel={TOUR_COPY.dialog}
          className="absolute rounded-card border border-subtle bg-surface-card"
          style={{
            left: CARD_MARGIN,
            right: CARD_MARGIN,
            bottom: cardBottom,
            maxHeight: cardMaxHeight > 0 ? cardMaxHeight : undefined,
          }}
        >
          <ScrollView
            // `flexGrow: 0` para que la tarjeta ABRACE su contenido cuando es corto y solo scrollee
            // cuando choca contra el techo de alto (mismo patrón que el panel de `Sheet.tsx`).
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerClassName="gap-2.5 p-3.5"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row items-start gap-2.5">
              <Image
                contentFit="contain"
                source={tourIconSource(step.icon)}
                style={{ width: 22, height: 22, marginTop: 2 }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Text
                accessibilityRole="header"
                className="min-w-0 flex-1 text-sm font-bold leading-snug text-strong"
              >
                {step.title}
              </Text>
            </View>

            <Text className="text-[13px] leading-5 text-body">{step.body}</Text>

            <View className="flex-row items-center justify-between gap-2">
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="flex-row items-center gap-1.5"
              >
                {steps.map((entry, dotIndex) => (
                  <MotiView
                    key={`${entry.target}-${dotIndex}`}
                    animate={{ width: dotIndex === index ? 16 : 6 }}
                    transition={transition}
                    className={
                      dotIndex === index
                        ? 'h-1.5 rounded-pill bg-primary'
                        : 'h-1.5 rounded-pill bg-surface-sunken'
                    }
                  />
                ))}
              </View>
              <Text
                className="font-mono text-[11px] text-subtle"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {index + 1}/{total}
              </Text>
            </View>

            <View className="flex-row items-center justify-between gap-2">
              {/* «Saltar» SIEMPRE visible, en todos los pasos (invariante de la SPEC). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={TOUR_COPY.skip}
                onPress={() => onEnd('skip')}
                className="min-h-11 items-center justify-center rounded-control px-2 active:opacity-70"
              >
                <Text className="text-xs font-semibold text-muted">{TOUR_COPY.skip}</Text>
              </Pressable>

              <View className="flex-row items-center gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={TOUR_COPY.prev}
                  accessibilityState={{ disabled: index === 0 }}
                  disabled={index === 0}
                  onPress={goPrev}
                  className="h-11 w-11 items-center justify-center rounded-control border border-subtle bg-surface-card active:opacity-70"
                  style={{ opacity: index === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft color={theme.foreground} size={18} />
                </Pressable>

                {isLast ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={TOUR_COPY.done}
                    onPress={() => onEnd('done')}
                    className="min-h-11 items-center justify-center rounded-control bg-primary px-4 active:opacity-70"
                  >
                    <Text className="text-sm font-bold text-white">{TOUR_COPY.done}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={TOUR_COPY.next}
                    onPress={goNext}
                    className="h-11 w-11 items-center justify-center rounded-control bg-primary active:opacity-70"
                  >
                    <ChevronRight color="#FFFFFF" size={18} />
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

/* ------------------------------------------------------------------------------------------------
 * useTourController — la memoria D4 en UN solo lugar
 * ---------------------------------------------------------------------------------------------- */

export type TourControllerOptions = {
  tourId: TourId
  coachId: string | null | undefined
  /**
   * `true` = esta ENTRADA a la superficie es elegible para auto-arrancar. Se lee UNA vez, al montar:
   * si el editor abre en creación el valor entra en `false` y aunque después pase a `true` en el
   * mismo montaje NO arranca — la SPEC lo pide explícito («el auto-arranque espera a la próxima
   * entrada en modo edición normal: un tour sobre un plan vacío enseña menos»).
   */
  autoStart?: boolean
  /**
   * Compuerta de tiempo, esta sí observada en vivo: el auto-arranque espera a que sea `true`.
   *
   * Existe porque en RN la pantalla monta ANTES de tener con qué enseñar — la identidad del coach
   * llega del branding en storage y el roster del hub, de la red. Auto-arrancar antes sería medir
   * targets que todavía no existen y, peor, marcar el flag bajo el cajón `anon` en vez del coach
   * real, con lo que la guía volvería a saltar en la próxima entrada. La superficie es quien sabe
   * cuándo está lista; el default `true` deja el caso simple igual que en web.
   */
  autoStartReady?: boolean
}

export type TourController = {
  active: boolean
  /** Camino manual (el «?»): repite el tour desde el paso 1 y NO toca el flag hasta que termine. */
  start: () => void
  /** «Listo» y «Saltar» marcan igual (D4): el tour no vuelve a insistir. */
  end: (reason: TourEndReason) => void
}

export function useTourController({
  tourId,
  coachId,
  autoStart = false,
  autoStartReady = true,
}: TourControllerOptions): TourController {
  const [active, setActive] = useState(false)
  const eligibleOnMount = useRef(autoStart)
  const autoStartDone = useRef(false)

  useEffect(() => {
    if (!eligibleOnMount.current || autoStartDone.current || !autoStartReady) return
    autoStartDone.current = true
    let cancelled = false
    // `hasSeenTour` es fail-closed si el storage falla (ver `tour-flags`).
    void hasSeenTour(tourId, coachId).then((seen) => {
      if (!cancelled && !seen) setActive(true)
    })
    return () => {
      cancelled = true
    }
  }, [tourId, coachId, autoStartReady])

  const start = useCallback(() => setActive(true), [])

  // Recibe la razón por contrato (`onEnd` del overlay la manda) y NO la mira: D4 dice que «Saltar» y
  // «Listo» marcan igual. La razón sigue viajando por si alguna superficie quiere emitirla como
  // evento, pero la memoria del tour no distingue — el que saltó tampoco quiere que le insistan.
  const end = useCallback(() => {
    void markTourSeen(tourId, coachId)
    setActive(false)
  }, [tourId, coachId])

  return { active, start, end }
}
