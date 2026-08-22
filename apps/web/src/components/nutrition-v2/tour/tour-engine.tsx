'use client'

import Image from 'next/image'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useOnboardingMode } from '@/components/coach/OnboardingModeContext'
import { hasSeenTour, markTourSeen } from './tour-flags'
import {
  TOUR_CARD_WIDTH,
  TOUR_VIEWPORT_MARGIN,
  computeCardPlacement,
  computeSpotlight,
  needsScrollIntoView,
  type TourCardPlacement,
  type TourRect,
  type TourSpotlight,
  type TourViewport,
} from './tour-geometry'
import { tourIconSrc, type TourId, type TourStep } from './tours'

/**
 * Motor de la Guía Viva (SPEC `nutrition-onboarding-tour`, D3 + D5) — el spotlight de onboarding de
 * Nutrición para web/PWA.
 *
 * Un motor propio y no una librería (D1): el contrato es chico, driver.js no cubre RN (y el espejo
 * RN tiene que comportarse igual), y ninguna lib de tour respeta por sí sola los dos invariantes
 * BLOQUEANTES del dueño — D3 (la tarjeta SIEMPRE completa en viewport) y la inercia total de la UI
 * de abajo. Cero dependencias nuevas: todo lo que se usa acá ya estaba en el repo.
 *
 * Anatomía de un paso (D5):
 *   4 paños oscuros + halo   → el recorte vivo sobre el target (`tour-geometry.ts` calcula los rects)
 *   tarjeta                  → ícono clay 22px + título + cuerpo + dots + ← → + «Saltar» + n/N
 *
 * Lo que este archivo NO hace: decidir cuándo arranca el tour en cada superficie. Eso es
 * `useTourController` (abajo), que es donde vive la memoria D4 — un solo lugar para el invariante
 * «auto-arranque solo la primera vez, y jamás en creación».
 *
 * ⚠️ Los `data-tour-*` del DOM son los anclas del gate geométrico (`scripts/cabina-visual-check.mjs`,
 * G2.3): renombrarlos sin tocar el script deja el gate verde midiendo el vacío.
 */

/* ------------------------------------------------------------------------------------------------
 * Constantes de pintura
 * ---------------------------------------------------------------------------------------------- */

/**
 * Velo al 74% (D5, número del dueño). No usa `--surface-overlay` del DS (0,55 en claro / 0,62 en
 * oscuro) porque acá el velo tiene una función distinta a la de un modal: no atenúa el fondo, tiene
 * que APAGARLO para que el recorte se lea como la única cosa encendida de la pantalla. Y es el mismo
 * negro en los dos temas a propósito — el foco de un spotlight no cambia con el tema.
 */
const TOUR_VEIL = 'rgb(0 0 0 / 0.74)'

/**
 * Capas. El editor único ya tiene su propio orden: lienzo `z-[60]`, PublishBar `z-[65]`, sheets y
 * diálogos `z-[70]`/`z-[71]`. El tour tiene que quedar por ENCIMA de todo eso (si no, un sheet
 * abierto se comería el velo) y el «?» apenas por encima de la PublishBar, que es lo único con lo
 * que comparte esquina.
 */
const TOUR_OVERLAY_Z = 'z-[90]'
const TOUR_HELP_Z = 'z-[66]'

/** Duración de las transiciones de geometría (D5: 220-280ms). */
const TOUR_TRANSITION = 'motion-safe:duration-[240ms] motion-safe:ease-out'

const COPY = {
  skip: 'Saltar',
  done: 'Listo',
  prev: 'Paso anterior',
  next: 'Paso siguiente',
  /** Nombre accesible del «?» (D2). No es copy de guion: es la etiqueta del control. */
  help: 'Abrir la guía de esta pantalla',
  dialog: 'Guía de esta pantalla',
} as const

/* ------------------------------------------------------------------------------------------------
 * Viewport
 *
 * `(min-width: 48rem)` es EXACTAMENTE el breakpoint de la cinta del editor (`useRibbonViewport`).
 * Se repite acá en vez de importarse porque ese hook vive en la carpeta de la ruta
 * (`app/coach/nutrition-v2/[clientId]/_quick-edit/`) y este componente es de librería: un
 * `components/ → app/` sería una dependencia al revés. El literal es el mismo y está anotado en los
 * dos lados; si alguna vez se mueve, se mueven juntos.
 * ---------------------------------------------------------------------------------------------- */

const TOUR_WIDE_QUERY = '(min-width: 48rem)'

function subscribeWideViewport(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(TOUR_WIDE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getWideViewportSnapshot(): boolean {
  return window.matchMedia(TOUR_WIDE_QUERY).matches
}

/** Snapshot de servidor `false` = móvil: hydration-safe, mismo patrón que `use-reduced-motion`. */
function getWideViewportServerSnapshot(): boolean {
  return false
}

/** `true` desde 768 (guion largo + tarjeta lateral); `false` = guion corto + tarjeta dock. */
export function useTourWideViewport(): boolean {
  return React.useSyncExternalStore(
    subscribeWideViewport,
    getWideViewportSnapshot,
    getWideViewportServerSnapshot,
  )
}

/* ------------------------------------------------------------------------------------------------
 * Medición del DOM
 * ---------------------------------------------------------------------------------------------- */

function toRect(rect: DOMRect): TourRect {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function currentViewport(): TourViewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * El elemento a iluminar.
 *
 * Busca TODOS los `[data-tour="x"]` y se queda con el primero RENDERIZADO, no con el primero del
 * documento. La diferencia importa porque las superficies reales pintan el mismo target dos veces y
 * dejan que el CSS elija cuál se ve: el roster del hub tiene la fila del alumno como card (`lg:hidden`)
 * y como fila de tabla (`hidden lg:block`), y las dos llevan el mismo `data-tour`. Con
 * `querySelector` a secas, en desktop se elegía la card oculta —`display:none` mide 0×0 en 0,0— y el
 * recorte del paso se iba a la esquina superior izquierda con tamaño cero.
 *
 * `getClientRects()` vacío es exactamente «no está en el flujo» (`display:none` o un ancestro
 * oculto); un elemento con `visibility:hidden` sí devuelve rects y sigue ocupando su lugar, que es
 * el comportamiento correcto para el recorte. Si NINGUNO está renderizado se devuelve `null`: un
 * elemento presente en el DOM pero oculto por breakpoint (`hidden lg:flex` del rail/paleta entre
 * 768-1023) medía 0×0 en (0,0) y dejaba un pinhole de halo fantasma en la esquina; con `null` el
 * paso cae al velo liso con la tarjeta centrada, que es el degradado documentado.
 */
function findTarget(target: string, scope: HTMLElement | Document | null): HTMLElement | null {
  const root = scope ?? document
  // `CSS.escape` con guarda: los targets del guion son slugs simples, pero un selector armado con
  // interpolación sin escapar es la clase de detalle que se rompe recién el día que alguien agregue
  // un target con un carácter raro.
  const value = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target) : target
  const matches = root.querySelectorAll<HTMLElement>(`[data-tour="${value}"]`)
  for (const candidate of matches) {
    if (candidate.getClientRects().length > 0) return candidate
  }
  return null
}

/**
 * `useLayoutEffect` avisa por consola cuando corre en el render de servidor. Este overlay es un
 * componente de cliente que igual se renderiza en SSR (devuelve `null` hasta montar), así que la
 * versión isomórfica evita el ruido sin cambiar el comportamiento en el navegador, donde la
 * medición TIENE que pasar antes de pintar.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

/**
 * Alto del área segura inferior. Se lee del navegador con una sonda de un frame en vez de hardcodear
 * un número: `env(safe-area-inset-bottom)` no es accesible desde JS de ninguna otra forma, y en el
 * dock (donde la tarjeta se apoya abajo) la diferencia entre 0 y 34 px es que la barra de gestos del
 * iPhone se coma o no el botón «Saltar».
 */
function readSafeAreaBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px);'
  document.body.appendChild(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return height
}

/** Los focusables de la tarjeta, en orden de tabulación. */
function focusableChildren(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
  )
}

type TourGeometry = {
  readonly placement: TourCardPlacement
  readonly spotlight: TourSpotlight
  readonly hasTarget: boolean
}

/** Comparación laxa: las diferencias sub-píxel del layout no ameritan un re-render. */
function sameGeometry(a: TourGeometry | null, b: TourGeometry): boolean {
  if (!a) return false
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5
  return (
    a.hasTarget === b.hasTarget &&
    a.placement.mode === b.placement.mode &&
    a.placement.side === b.placement.side &&
    near(a.placement.top, b.placement.top) &&
    near(a.placement.left, b.placement.left) &&
    near(a.placement.width, b.placement.width) &&
    near(a.placement.maxHeight, b.placement.maxHeight) &&
    near(a.spotlight.hole.top, b.spotlight.hole.top) &&
    near(a.spotlight.hole.left, b.spotlight.hole.left) &&
    near(a.spotlight.hole.width, b.spotlight.hole.width) &&
    near(a.spotlight.hole.height, b.spotlight.hole.height)
  )
}

/* ------------------------------------------------------------------------------------------------
 * TourOverlay
 * ---------------------------------------------------------------------------------------------- */

export type TourEndReason = 'done' | 'skip'

export type TourOverlayProps = {
  /** El guion (ver `tours.ts`). Debe tener al menos un paso. */
  steps: readonly TourStep[]
  active: boolean
  /** «Listo» manda `done`; «Saltar», Esc y el back de Android mandan `skip`. Los dos marcan (D4). */
  onEnd: (reason: TourEndReason) => void
  /**
   * Dónde buscar los `data-tour`. Sin scope se busca en todo el documento, que es lo correcto para
   * el editor (la PublishBar y los sheets están portaleados fuera del lienzo).
   */
  scopeRef?: React.RefObject<HTMLElement | null>
}

export function TourOverlay({ steps, active, onEnd, scopeRef }: TourOverlayProps) {
  const [index, setIndex] = React.useState(0)
  const [geometry, setGeometry] = React.useState<TourGeometry | null>(null)
  // Contador que fuerza re-medición (resize, scroll, cambio de tamaño de la tarjeta).
  const [measureTick, setMeasureTick] = React.useState(0)
  const [mounted, setMounted] = React.useState(false)

  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const safeBottomRef = React.useRef(0)

  const wide = useTourWideViewport()
  const dock = !wide

  const total = steps.length
  const step = steps[Math.min(index, Math.max(0, total - 1))]
  const isLast = index >= total - 1

  const titleId = React.useId()
  const bodyId = React.useId()

  // El portal necesita `document`: en el render de servidor no se pinta nada.
  React.useEffect(() => setMounted(true), [])

  // Cada apertura empieza en el paso 1 (D4: el «?» repite el tour entero, no lo reanuda).
  React.useEffect(() => {
    if (active) setIndex(0)
  }, [active])

  const requestMeasure = React.useCallback(() => setMeasureTick((tick) => tick + 1), [])

  const measure = React.useCallback(() => {
    if (!active || !step) return
    const viewport = currentViewport()
    const element = findTarget(step.target, scopeRef?.current ?? null)
    const target = element ? toRect(element.getBoundingClientRect()) : null
    const card = cardRef.current

    const next: TourGeometry = {
      hasTarget: target !== null,
      spotlight: computeSpotlight(target, viewport),
      placement: computeCardPlacement({
        target,
        viewport,
        dock,
        safeBottom: safeBottomRef.current,
        card: {
          width: TOUR_CARD_WIDTH,
          // Antes de la primera medición no hay tarjeta en el DOM: se usa un alto plausible y el
          // layout effect corrige ANTES de pintar, así que el coach nunca ve la posición provisoria.
          height: card?.offsetHeight ?? 160,
        },
      }),
    }

    setGeometry((prev) => (sameGeometry(prev, next) ? prev : next))
  }, [active, step, dock, scopeRef])

  /**
   * Entrada a un paso: primero traer el target a la vista (D3), después medir. `scrollIntoView` sin
   * `behavior:'smooth'` a propósito — un scroll animado deja el rect en movimiento durante ~300 ms y
   * la tarjeta quedaría persiguiendo un target que todavía se mueve (y el gate mediría cualquier
   * cosa). El salto instantáneo es además lo que pide la SPEC al pie de la letra.
   */
  useIsomorphicLayoutEffect(() => {
    if (!active || !step) return
    safeBottomRef.current = readSafeAreaBottom()
    const element = findTarget(step.target, scopeRef?.current ?? null)
    if (element) {
      const rect = toRect(element.getBoundingClientRect())
      if (needsScrollIntoView(rect, currentViewport())) element.scrollIntoView({ block: 'center' })
    }
    measure()
    // `measureTick` está en las deps para que resize/scroll/ResizeObserver vuelvan a pasar por acá.
    // `mounted` también, y no es decorativo: si una superficie monta el overlay YA con `active` en
    // `true` (el patrón `{abierto && <TourOverlay active … />}`), el primer render devuelve `null`
    // —todavía no hay `document` para el portal— y sin esta dependencia la medición no volvería a
    // correr nunca: la tarjeta se quedaría invisible para siempre.
  }, [active, mounted, step, dock, measureTick, measure, scopeRef])

  /**
   * Re-medición ante lo que mueve el mundo. El `scroll` va en CAPTURA porque no burbujea: sin eso, el
   * scroll del lienzo del editor (un `overflow-y-auto` interno, no el de la ventana) dejaría el
   * recorte pegado donde estaba.
   */
  React.useEffect(() => {
    if (!active) return
    window.addEventListener('resize', requestMeasure)
    window.addEventListener('scroll', requestMeasure, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', requestMeasure)
      window.removeEventListener('scroll', requestMeasure, { capture: true })
    }
  }, [active, requestMeasure])

  // La tarjeta puede cambiar de alto sin que cambie el paso (fuentes que cargan tarde, zoom del
  // navegador). Si crece, el clamp de D3 tiene que rehacerse o se sale por abajo.
  React.useEffect(() => {
    const card = cardRef.current
    if (!active || !card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(requestMeasure)
    observer.observe(card)
    return () => observer.disconnect()
    // `mounted` por lo mismo que en el efecto de medición: antes de montar no hay tarjeta que observar.
  }, [active, mounted, requestMeasure])

  /**
   * Foco (D5). Al abrir, el foco entra a la tarjeta; al cerrar, vuelve a donde estaba — que en el
   * camino manual es justamente el «?».
   *
   * La condición NO es `active` a secas sino «activo Y ya medido», y eso salió de un bug cazado con
   * Playwright: hasta la primera medición la tarjeta se pinta con `visibility:hidden` (para que no
   * asome en la esquina), y un elemento con `visibility:hidden` NO ES FOCUSEABLE — el `focus()` era
   * un no-op silencioso y el foco se quedaba en el `<body>` en el PRIMER arranque de cada carga
   * (justo el caso del auto-arranque). Con `geometry` en la condición, el foco entra recién cuando la
   * tarjeta existe de verdad en pantalla.
   */
  const canFocusCard = active && geometry !== null
  React.useEffect(() => {
    if (!canFocusCard) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus({ preventScroll: true })
    return () => previous?.focus({ preventScroll: true })
  }, [canFocusCard])

  const goNext = React.useCallback(() => {
    setIndex((current) => {
      if (current >= total - 1) return current
      return current + 1
    })
  }, [total])

  const goPrev = React.useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  /**
   * Teclado. Esc = Saltar (D5, y el tour «jamás bloquea la salida»). El Tab queda ATRAPADO en la
   * tarjeta: la UI de abajo está inerte al puntero, así que dejar que el foco se vaya ahí sería
   * ofrecer controles que no responden.
   *
   * En CAPTURA para ganarle a cualquier handler de Esc de las superficies de abajo (el editor cierra
   * sheets con Esc; con el tour abierto, Esc es del tour).
   */
  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onEnd('skip')
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
        return
      }
      if (event.key !== 'Tab') return

      const focusables = focusableChildren(cardRef.current)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement
      const inside = cardRef.current?.contains(current instanceof Node ? current : null)

      if (!inside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [active, onEnd, goNext, goPrev])

  if (!active || !mounted || !step) return null

  const placement = geometry?.placement ?? null
  const spotlight = geometry?.spotlight ?? null

  const paneClasses = cn(
    'pointer-events-auto absolute motion-safe:transition-[top,left,width,height]',
    TOUR_TRANSITION,
  )

  return createPortal(
    <div
      data-tour-overlay=""
      data-tour-step={index + 1}
      data-tour-total={total}
      data-tour-target={step.target}
      className={cn('pointer-events-none fixed inset-0', TOUR_OVERLAY_Z)}
    >
      {/* Los 4 paños. `pointer-events-auto` es lo que deja inerte a la UI de abajo (D5). */}
      {spotlight ? (
        <>
          <div
            data-tour-pane="top"
            aria-hidden="true"
            className={paneClasses}
            style={{ ...rectStyle(spotlight.panes.top), backgroundColor: TOUR_VEIL }}
          />
          <div
            data-tour-pane="bottom"
            aria-hidden="true"
            className={paneClasses}
            style={{ ...rectStyle(spotlight.panes.bottom), backgroundColor: TOUR_VEIL }}
          />
          <div
            data-tour-pane="left"
            aria-hidden="true"
            className={paneClasses}
            style={{ ...rectStyle(spotlight.panes.left), backgroundColor: TOUR_VEIL }}
          />
          <div
            data-tour-pane="right"
            aria-hidden="true"
            className={paneClasses}
            style={{ ...rectStyle(spotlight.panes.right), backgroundColor: TOUR_VEIL }}
          />

          {/* Halo. Además de dibujar el borde del recorte, es el que TAPA el hueco: sin él, el
              elemento iluminado seguiría clickeable y el coach podría disparar una acción real en
              medio del tour. Por eso `pointer-events-auto` en un elemento decorativo. */}
          {geometry?.hasTarget ? (
            <div
              data-tour-halo=""
              aria-hidden="true"
              className={cn(
                'pointer-events-auto absolute rounded-control ring-2 ring-white/85',
                'motion-safe:transition-[top,left,width,height]',
                TOUR_TRANSITION,
              )}
              style={{
                ...rectStyle(spotlight.hole),
                boxShadow: '0 0 0 6px rgb(255 255 255 / 0.14)',
              }}
            />
          ) : null}
        </>
      ) : null}

      <div
        ref={cardRef}
        data-tour-card=""
        data-tour-mode={placement?.mode ?? 'anchored'}
        data-tour-side={placement?.side ?? 'center'}
        role="dialog"
        aria-modal="true"
        aria-label={COPY.dialog}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={cn(
          'pointer-events-auto absolute flex flex-col gap-2.5 overflow-y-auto overscroll-contain',
          'rounded-card border border-border-subtle bg-surface-card p-3.5 shadow-xl',
          'focus:outline-none motion-safe:transition-[top,left,width]',
          TOUR_TRANSITION,
        )}
        style={{
          top: placement?.top ?? TOUR_VIEWPORT_MARGIN,
          left: placement?.left ?? TOUR_VIEWPORT_MARGIN,
          width: placement?.width ?? TOUR_CARD_WIDTH,
          maxHeight: placement?.maxHeight,
          // Mientras no hay geometría medida la tarjeta existe (hay que medirla) pero no se pinta:
          // así el primer frame no muestra un salto desde la esquina.
          visibility: placement ? 'visible' : 'hidden',
        }}
      >
        <div className="flex items-start gap-2.5">
          <Image
            alt=""
            aria-hidden="true"
            src={tourIconSrc(step.icon)}
            width={22}
            height={22}
            // Asset estático del build: nada que transformar (y las Image Transformations son cuota).
            unoptimized
            className="mt-0.5 size-[22px] shrink-0 object-contain"
          />
          <h2 id={titleId} className="text-sm font-bold leading-snug text-strong">
            {step.title}
          </h2>
        </div>

        <p id={bodyId} className="text-[13px] leading-relaxed text-body">
          {step.body}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div aria-hidden="true" className="flex items-center gap-1.5">
            {steps.map((entry, dotIndex) => (
              <span
                key={`${entry.target}-${dotIndex}`}
                data-tour-dot={dotIndex === index ? 'active' : 'idle'}
                className={cn(
                  'h-1.5 rounded-pill motion-safe:transition-[width,background-color]',
                  TOUR_TRANSITION,
                  dotIndex === index ? 'w-4 bg-sport-500' : 'w-1.5 bg-border-default',
                )}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-subtle">
            {index + 1}/{total}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* «Saltar» SIEMPRE visible, en todos los pasos (invariante de la SPEC). */}
          <button
            type="button"
            data-tour-action="skip"
            onClick={() => onEnd('skip')}
            className={cn(
              'inline-flex min-h-8 cursor-pointer items-center rounded-control px-2 text-xs font-semibold text-muted',
              'hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              '[@media(pointer:coarse)]:min-h-11',
            )}
          >
            {COPY.skip}
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-tour-action="prev"
              aria-label={COPY.prev}
              disabled={index === 0}
              onClick={goPrev}
              className={cn(
                'inline-flex size-9 cursor-pointer items-center justify-center rounded-control',
                'border border-border-subtle bg-surface-card text-strong hover:bg-surface-sunken',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-card',
                '[@media(pointer:coarse)]:size-11',
              )}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>

            {isLast ? (
              <button
                type="button"
                data-tour-action="done"
                onClick={() => onEnd('done')}
                className={cn(
                  'inline-flex min-h-9 cursor-pointer items-center rounded-control bg-sport-500 px-3',
                  'text-xs font-semibold text-on-sport hover:bg-sport-600',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  '[@media(pointer:coarse)]:min-h-11',
                )}
              >
                {COPY.done}
              </button>
            ) : (
              <button
                type="button"
                data-tour-action="next"
                aria-label={COPY.next}
                onClick={goNext}
                className={cn(
                  'inline-flex size-9 cursor-pointer items-center justify-center rounded-control',
                  'bg-sport-500 text-on-sport hover:bg-sport-600',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  '[@media(pointer:coarse)]:size-11',
                )}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function rectStyle(rect: TourRect): React.CSSProperties {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

/* ------------------------------------------------------------------------------------------------
 * useTourController — la memoria D4 en UN solo lugar
 * ---------------------------------------------------------------------------------------------- */

export type TourControllerOptions = {
  tourId: TourId
  coachId: string | null | undefined
  /**
   * `true` = esta entrada a la superficie puede auto-arrancar el tour. Se lee UNA vez, al montar: si
   * la superficie abre en creación (`?from=`) el valor entra en `false` y aunque después pase a
   * `true` en el mismo montaje NO arranca — la SPEC lo pide explícito («el auto-arranque espera a la
   * próxima entrada en modo edición normal: un tour sobre un plan vacío enseña menos»).
   */
  autoStart?: boolean
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
}: TourControllerOptions): TourController {
  const [active, setActive] = React.useState(false)
  // «Un solo onboarding por área» (owner 22-08): con la guía del coach ACTIVA, este tour no se
  // auto-arranca. Fuera del panel del coach (harness, tests) el contexto cae en `false` y todo se
  // comporta como antes. Se congela al montar, igual que `autoStart`: que el coach termine la guía
  // mientras mira esta pantalla no le tira un spotlight encima sin haberlo pedido.
  const { guideActive } = useOnboardingMode()
  const autoStartOnMount = React.useRef(autoStart)
  const guideActiveOnMount = React.useRef(guideActive)
  const autoStartDone = React.useRef(false)

  React.useEffect(() => {
    if (!autoStartOnMount.current || autoStartDone.current) return
    // OJO: sale ANTES de tocar la memoria del tour. El «?» sigue abriéndolo y, cuando la guía
    // termine o se descarte, la próxima entrada a la superficie lo auto-arrancará como siempre —
    // marcar «visto» acá se lo habría comido para siempre sin haberlo mostrado nunca.
    if (guideActiveOnMount.current) return
    autoStartDone.current = true
    // `hasSeenTour` es fail-closed fuera del navegador y con storage bloqueado (ver `tour-flags`).
    if (hasSeenTour(tourId, coachId)) return
    setActive(true)
  }, [tourId, coachId])

  const start = React.useCallback(() => setActive(true), [])

  // Recibe la razón por contrato (`onEnd` del overlay la manda) y NO la mira: D4 dice que «Saltar» y
  // «Listo» marcan igual. La razón sigue viajando por si alguna superficie quiere emitirla como
  // evento, pero la memoria del tour no distingue — el que saltó tampoco quiere que le insistan.
  const end = React.useCallback(() => {
    markTourSeen(tourId, coachId)
    setActive(false)
  }, [tourId, coachId])

  return { active, start, end }
}

export { COPY as TOUR_COPY, TOUR_HELP_Z }
