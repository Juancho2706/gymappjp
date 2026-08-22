import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native'
import type { LayoutRectangle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { useTheme } from '../../../context/ThemeContext'
import { EASE, useEvaMotion } from '../../../lib/motion'
import { tourAutoStartEligible, useOnboardingMode } from '../../../lib/onboarding-mode'
import { hasSeenTour, markTourSeen } from './tour-flags'
import { computeTourHole, panesFor, type TourFrame } from './tour-geometry'
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
 * - **La UI de abajo NO queda inerte gratis.** Mientras el overlay fue `Modal` la ventana propia lo
 *   regalaba; desde que es un hermano en la misma ventana hay que reclamar los toques a mano, igual
 *   que el `pointer-events-auto` de los paños y del halo en web (ver el responder de los paños más
 *   abajo). Sin eso la escena sigue scrolleando DEBAJO del velo — y un target que se mueve después
 *   de medido es exactamente cómo un recorte termina apuntando a lo que no es.
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

/**
 * Reclamo de toques del velo, tal cual el `pointer-events-auto` que web pone en los paños y en el
 * halo (D5: «que el coach no dispare una acción real en medio del tour»).
 *
 * No alcanza con pintar encima. Una `View` sin handlers NO bloquea nada en Android: si ninguna vista
 * de JS se hace responder del gesto, el `dispatchTouchEvent` sigue bajando por los hermanos y el
 * ScrollView de la escena scrollea DEBAJO del tour. Eso es lo que reportó el dueño sin saberlo — la
 * lista se movía con el tour abierto y el recorte, medido antes del movimiento, quedaba señalando
 * otra cosa. Con `onStartShouldSetResponder` el paño toma el gesto y RN emite el `setJSResponder`
 * que corta al nativo; `onResponderTerminationRequest` en `false` es la otra mitad, porque si no un
 * ScrollView puede pedir el gesto a mitad del arrastre y recuperar el scroll.
 *
 * Va SOLO en los paños y en el halo, nunca en la raíz: en la raíz, ese mismo «no cedo el gesto»
 * dejaría sin scroll al ScrollView interno de la tarjeta cuando el texto del paso no entra.
 */
const VEIL_TOUCH_BLOCKER = {
  onStartShouldSetResponder: () => true,
  onMoveShouldSetResponder: () => true,
  onResponderTerminationRequest: () => false,
} as const

/** Margen mínimo de la tarjeta contra los bordes. Es el colchón que hace verdadero a D3. */
const CARD_MARGIN = 12
// Piso de la safe area superior. `useSafeAreaInsets` devuelve 0 arriba en algunos OEM con
// edge-to-edge (reproducido en el Xiaomi del dueño), y sin piso la tarjeta flipeada se apoya sobre
// el reloj y los iconos de señal. 24 dp es la altura mínima histórica de la barra de estado Android.
const MIN_TOP_INSET = 24

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
 * TourOverlay
 * ---------------------------------------------------------------------------------------------- */

export type TourEndReason = 'done' | 'skip'

export type TourOverlayProps = {
  /** El guion (ver `tours.ts`). Debe tener al menos un paso. */
  steps: readonly TourStep[]
  active: boolean
  /** «Listo» manda `done`; «Saltar» y el back de Android mandan `skip`. Los dos marcan (D4). */
  onEnd: (reason: TourEndReason) => void
  /**
   * Banda que la tarjeta dock debe dejar libre abajo, ADEMÁS de la safe area. Existe para el chrome
   * flotante que se pinta después de la escena y al que ningún `zIndex` del overlay le gana: el hub
   * la pasa con `COACH_TABBAR_CLEARANCE` (la cápsula del coach), el editor la deja en 0.
   */
  bottomClearance?: number
}

export function TourOverlay({ steps, active, onEnd, bottomClearance = 0 }: TourOverlayProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const targets = useTourTargets()

  const [index, setIndex] = useState(0)
  const [frame, setFrame] = useState<TourFrame | null>(null)
  const [hole, setHole] = useState<TourRect | null>(null)
  // Alto medido de la tarjeta: lo necesita el flip de abajo (saber si taparía al target).
  const [cardHeight, setCardHeight] = useState(0)
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
   * Banda de chrome del sistema que cae DENTRO del overlay. Solo existe cuando el overlay llega
   * hasta el borde de la ventana (`originY <= 0`): si la pantalla ya lo montó bajo una franja de
   * safe area, su `y = 0` es contenido real y descontar ahí la barra de estado descartaría huecos
   * legítimos. A diferencia de la tarjeta, este número NO lleva piso de 24 dp: acá decide si un
   * recorte válido se tira a la basura, así que vale lo medido y nada más.
   */
  const systemTopBand = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  )
  const holeSafeTop = frame !== null && frame.originY <= 0 ? systemTopBand : 0

  /**
   * Entrada a un paso: medir el target y recortar el velo. Cambia con el paso y con el frame, así
   * que una rotación de pantalla (que re-dispara `onLayout`) vuelve a medir sola.
   */
  useEffect(() => {
    if (!active || !step || !frame) return
    let cancelled = false
    void (async () => {
      // QA owner 17-08: espejo del `scrollIntoView` web — sin esto, un target bajo el pliegue se
      // medía fuera de pantalla y el clamp pegaba el hueco al borde ENCIMA de otro componente.
      await targets?.ensureTargetVisible(step.target)
      if (cancelled) return
      const rect = await targets?.measureTarget(step.target)
      if (cancelled) return
      // `computeTourHole` es la ÚNICA compuerta: o el hueco cae entero sobre el target, o devuelve
      // `null` y el paso se pinta como velo liso. Reemplazó al ratio de «≥40% visible», que dejaba
      // pasar targets a medio salir y los aplastaba contra el borde superior — el bug del Xiaomi,
      // donde el recorte del paso 2 terminaba sobre la barra de estado (ver `tour-geometry.ts`).
      setHole(rect ? computeTourHole(rect, frame, { safeTop: holeSafeTop }) : null)
    })()
    if (!targets) setHole(null)
    return () => {
      cancelled = true
    }
  }, [active, step, frame, targets, holeSafeTop])

  // Back de Android = Saltar (D5: «el tour jamás bloquea la salida»). Antes lo daba gratis el
  // `onRequestClose` del Modal; sin Modal se escucha el hardware back mientras el tour está vivo.
  useEffect(() => {
    if (!active) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onEnd('skip')
      return true
    })
    return () => subscription.remove()
  }, [active, onEnd])

  const goNext = useCallback(() => {
    setIndex((current) => (current >= total - 1 ? current : current + 1))
  }, [total])

  const goPrev = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  // Sin Modal ya no hay `visible={active}`: el propio componente se desmonta del render.
  if (!active || !step) return null

  const safeFrame: TourFrame = frame ?? { originX: 0, originY: 0, width: 0, height: 0 }
  const panes = panesFor(hole, safeFrame)
  const transition = { type: 'timing', duration: motion.duration('base'), easing: EASE.out } as const

  // QA del dueño 17-08 (Xiaomi, barra de gestos): la tarjeta se metía DEBAJO del reloj arriba y la
  // cápsula flotante del coach le pasaba POR ENCIMA abajo. Dos síntomas, una causa: el posicionador
  // conocía las safe areas pero ninguna franja de chrome flotante.
  //
  // Abajo no hay arreglo por z-order. Desde `fd13886a` el overlay dejó de ser `Modal` y es un hermano
  // dentro de la pantalla, mientras que el `BottomTabView` pinta su barra DESPUÉS de todas las
  // escenas: ningún `zIndex` de acá le gana. Hay que reservar la banda, y por eso el hueco entra por
  // prop — el hub vive bajo la cápsula del coach, el editor no.
  //
  // Arriba, `insets.top` llega en 0 en algunos OEM con edge-to-edge, y `insets.top + CARD_MARGIN`
  // dejaba la tarjeta pisando la hora. Se le pone piso con la altura real de la barra de estado.
  const topSafe = Math.max(systemTopBand, MIN_TOP_INSET)

  // Techo de alto de la tarjeta (D3). Si el contenido no cabe, scrollea ADENTRO en vez de
  // desbordar: una tarjeta más alta que la pantalla no puede ser ⊆ viewport de ninguna otra forma.
  const cardBottom = Math.max(insets.bottom, CARD_MARGIN) + bottomClearance
  const cardMaxHeight = Math.max(
    0,
    safeFrame.height - topSafe - CARD_MARGIN - cardBottom - CARD_MARGIN,
  )

  // QA owner 17-08 (paridad con `computeCardPlacement` web): la tarjeta dock JAMÁS debe tapar lo
  // que ilumina. Caso real: los pasos de la mini-cinta y de publicar apuntan a la PublishBar, que
  // vive exactamente donde el dock se apoya. Si el recorte cae en la franja de abajo Y arriba
  // queda libre, la tarjeta flipea al borde superior; si taparía en ambos extremos (target
  // gigante) gana abajo — regla D3: mejor solapar que no poder leer/cerrar.
  const cardTopWhenFlipped = topSafe + CARD_MARGIN
  const overlapsCardZone = (zoneTop: number) =>
    hole !== null &&
    cardHeight > 0 &&
    hole.top < zoneTop + cardHeight &&
    hole.top + hole.height > zoneTop
  const dockAtTop =
    overlapsCardZone(safeFrame.height - cardBottom - cardHeight) &&
    !overlapsCardZone(cardTopWhenFlipped)

  return (
    // QA owner 17-08 (Xiaomi): el overlay DEJÓ de ser `Modal`. La ventana propia del Modal medía
    // su origen distinto de como la ventana principal mide los targets en algunos OEM (el hueco
    // salía corrido ~1 status bar hacia arriba y «iluminaba» lo que no era). Como hermano absoluto
    // DENTRO de la misma ventana, target y overlay comparten sistema de coordenadas por
    // construcción — la clase entera de bugs de ventana muere. Los paños siguen tapando y
    // bloqueando toques; el back de Android lo maneja el BackHandler del componente.
    <View
      ref={rootRef}
      collapsable={false}
      // La raíz solo posiciona: no reclama toques (ver `VEIL_TOUCH_BLOCKER`). Quien deja inerte a la
      // escena son los paños y el halo, que juntos cubren el overlay entero — con o sin recorte.
      onLayout={(event) => handleRootLayout(event.nativeEvent.layout)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 }}
    >
      <View collapsable={false} style={{ flex: 1 }}>
        {(['top', 'bottom', 'left', 'right'] as const).map((pane) => (
          <MotiView
            key={pane}
            animate={panes[pane]}
            transition={transition}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            {...VEIL_TOUCH_BLOCKER}
            style={{ position: 'absolute', backgroundColor: TOUR_VEIL }}
          />
        ))}

        {/* Halo: el borde del recorte. Decorativo a la vista, pero reclama el gesto igual que el
            halo web: el elemento iluminado se MUESTRA, no se usa — tocarlo dispararía una acción
            real (abrir un alumno, publicar) en medio de la explicación. */}
        {hole ? (
          <MotiView
            animate={hole}
            transition={transition}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            {...VEIL_TOUCH_BLOCKER}
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
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          style={{
            left: CARD_MARGIN,
            right: CARD_MARGIN,
            ...(dockAtTop ? { top: cardTopWhenFlipped } : { bottom: cardBottom }),
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
    </View>
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
  // Guía v2 del coach ACTIVA ⇒ ningún tour se dispara solo (decisión del owner 22-08: «no podemos
  // tener varios onboardings en una sola área»). El «?» sigue abriéndolo a pedido y ese camino NO
  // marca el tour como visto, así que el auto-arranque queda intacto para cuando la guía termine.
  const { guideActive } = useOnboardingMode()

  const [active, setActive] = useState(false)
  // Elegibilidad congelada al montar, igual que antes: se le suma el modo de onboarding para que la
  // guía no encienda un tour a mitad de pantalla si la foto del panel llega tarde.
  const eligibleOnMount = useRef(tourAutoStartEligible({ autoStart, guideActive }))
  const autoStartDone = useRef(false)

  useEffect(() => {
    if (!eligibleOnMount.current || autoStartDone.current || !autoStartReady) return
    // Segunda lectura, esta sí en vivo: entre el montaje y el `autoStartReady` puede llegar la foto
    // del panel. Sin marcar `autoStartDone`: la próxima entrada vuelve a decidir con datos frescos.
    if (guideActive) return
    autoStartDone.current = true
    let cancelled = false
    // `hasSeenTour` es fail-closed si el storage falla (ver `tour-flags`).
    void hasSeenTour(tourId, coachId).then((seen) => {
      if (!cancelled && !seen) setActive(true)
    })
    return () => {
      cancelled = true
    }
  }, [tourId, coachId, autoStartReady, guideActive])

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
