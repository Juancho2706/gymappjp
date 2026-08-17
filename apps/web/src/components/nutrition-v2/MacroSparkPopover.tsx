'use client'

import * as React from 'react'

import { MacroSpark, type MacroSparkProps } from '@/components/nutrition-v2/MacroSpark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * MacroSparkPopover (T3.v Cabina, SPEC D3) — el `MacroSpark` con los gramos exactos a un
 * hover/tap. La barra resume; este popover es la garantía de que NADA se esconde: «los gramos
 * nunca quedan inaccesibles» es invariante bloqueante de la tanda.
 *
 * Contrato de interacción (SPEC D3), uno solo para web:
 * - Puntero fino (`(hover: hover) and (pointer: fine)`): abre a los ~120 ms de hover y también al
 *   llegar el foco por un `Tab`/`Shift+Tab` REAL del usuario (ver «Modalidad de entrada» abajo:
 *   el foco devuelto por código al cerrar NO abre); cierra al salir del trigger/panel, al perder el
 *   foco o con `Esc`.
 * - Puntero grueso: tap abre (el click del trigger vive en las dos ramas), tap fuera cierra.
 * - Siempre: `Esc`, blur, click fuera, scroll del contenedor (listener en CAPTURA, porque `scroll`
 *   no burbujea) y la apertura de OTRO spark cierran este — un solo popover abierto en la página.
 * - Nunca mueve el foco: es un panel de lectura (`initialFocus`/`finalFocus` en `false`).
 *
 * Por qué NO se reusa `info-tooltip.tsx` para la rama hover: su API está cerrada sobre otro caso
 * (ícono `Info` fijo como trigger, `content: string`, `aria-label` «Información adicional») y su
 * hover es `onMouseEnter/Leave` sin gate de puntero fino, sin delay, sin rama de foco y sin
 * coordinación entre instancias — nada de eso es adaptable sin reescribirlo. Se usa el primitivo
 * `popover.tsx` directo, que sí trae lo que hace falta: `openOnHover` + `delay` en el trigger,
 * cierre por `Esc`/outside-press con razón en `onOpenChange`, y un Positioner que ya hace flip y
 * clamp contra el viewport (defaults verificados en `useAnchorPositioning`:
 * `collisionBoundary: 'clipping-ancestors'`, `collisionPadding: 5`, flip+shift activos).
 */
export type MacroSparkPopoverProps = MacroSparkProps & {
  fiberG?: number | null
  /** Meta de kcal del día/franja: si es > 0 el panel agrega «{n}% de la meta». */
  targetCalories?: number | null
  /** Contexto para el lector de pantalla (ej. nombre del alimento o de la franja). */
  ariaContext?: string
  /** Los macros son por 100 g (paleta/picker): el panel lo dice explícitamente. */
  per100?: boolean
  /**
   * Etiqueta de base EXPLÍCITA (ej. «por 30 g») que reemplaza el texto fijo de `per100`.
   * Existe por NUT-001: el catálogo tiene filas `per_serving` cuyos macros NO son por 100 g —
   * forzar `per100` ahí sería una mentira visual. Si se pasa, manda sobre `per100`; si no, el
   * comportamiento de `per100` queda intacto (prop aditiva, T3.v V1.4).
   */
  basisLabel?: string | null
}

// TODO(V1.5): estas cadenas se mudan a QE_COPY (`microcopy.ts`) cuando la tarea de microcopy
// agregue `sparkAria`/`sparkNoMacros`/`sparkPer100`/`sparkPctOfTarget`. Hoy la tabla no las tiene.
const COPY = {
  noMacros: 'Sin macros registrados',
  per100: 'por 100 g',
  fiber: (grams: string) => `Fibra ${grams} g`,
  pctOfTarget: (pct: number) => `${pct}% de la meta`,
  macros: (protein: string, carbs: string, fats: string) =>
    `P ${protein} g · C ${carbs} g · G ${fats} g`,
  aria: (protein: string, carbs: string, fats: string) =>
    `Macros: proteína ${protein} g, carbohidratos ${carbs} g, grasas ${fats} g`,
  ariaNoMacros: 'Macros: sin macros registrados',
} as const

/**
 * Gramos: entero desde 10 g (la precisión decimal ahí es ruido) y un decimal debajo, donde 0,8 g de
 * grasa sí cambia la lectura. Sin ceros de relleno: 8 g se lee «8», no «8.0».
 */
function fmtGrams(value: number | null | undefined): string {
  const safe = Math.max(0, value ?? 0)
  const rounded = safe < 10 ? Math.round(safe * 10) / 10 : Math.round(safe)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/* ------------------------------------------------------------------------------------------------
 * Un solo popover abierto por página. Coordinación module-level (no contexto) a propósito: los
 * sparks viven en árboles que no comparten provider — filas del canvas, header de franja, paleta,
 * picker y PublishBar — y el contrato «abrir B cierra A» tiene que valer entre todos ellos.
 * ---------------------------------------------------------------------------------------------- */
let activeSparkId: string | null = null
let activeSparkClose: (() => void) | null = null

function claimActiveSpark(id: string, close: () => void): void {
  // El cierre del anterior corre PRIMERO (se libera a sí mismo) y recién ahí se registra el nuevo.
  if (activeSparkId !== null && activeSparkId !== id) activeSparkClose?.()
  activeSparkId = id
  activeSparkClose = close
}

function releaseActiveSpark(id: string): void {
  if (activeSparkId !== id) return
  activeSparkId = null
  activeSparkClose = null
}

/* ------------------------------------------------------------------------------------------------
 * Rama de puntero. `useSyncExternalStore` con snapshot de servidor `false` (mismo patrón que
 * `use-reduced-motion`): durante la hydration el valor coincide con el HTML servido y recién
 * después se lee el media query real — cero riesgo de mismatch.
 * ---------------------------------------------------------------------------------------------- */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

function subscribeFinePointer(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(FINE_POINTER_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getFinePointerSnapshot(): boolean {
  return window.matchMedia(FINE_POINTER_QUERY).matches
}

function getFinePointerServerSnapshot(): boolean {
  return false
}

function useFinePointer(): boolean {
  return React.useSyncExternalStore(
    subscribeFinePointer,
    getFinePointerSnapshot,
    getFinePointerServerSnapshot,
  )
}

/* ------------------------------------------------------------------------------------------------
 * Modalidad de entrada — por qué existe este flag (bug cazado con Playwright, no teoría):
 *
 * Al cerrar (Esc, o el cierre por coordinación cuando se abre OTRO spark) Base UI devolvía el foco
 * al trigger de forma PROGRAMÁTICA. Chromium marcaba ese foco como `:focus-visible`, el handler de
 * `onFocus` lo leía como «el usuario llegó con el teclado» y REABRÍA el popover: cerraba en ~40 ms y
 * volvía a abrir en ~60 ms. Resultado medido: «Esc cierra» y «uno a la vez» fallaban siempre.
 *
 * El arreglo tiene dos capas y las dos hacen falta:
 *  1. `initialFocus`/`finalFocus` en `false` (abajo, en el `PopoverContent`): este popover es un
 *     panel de LECTURA — nunca debe mover el foco. Sin movimiento de foco no hay devolución que
 *     malinterpretar (y, de yapa, se mata un bug real: con el default, hacer click en un spark
 *     robaba el foco del campo de cantidad que el coach estaba editando).
 *  2. Este flag: `onFocus` abre SOLO si el foco llegó pegado a un `Tab`/`Shift+Tab` real del
 *     usuario. Cualquier otra tecla (Esc incluido) o cualquier `pointerdown` lo desarma, así que un
 *     foco devuelto por código —que no dispara ningún evento de input— nunca alcanza para abrir.
 *
 * Es module-level y en CAPTURA a propósito: la señal es del documento entero, no de una instancia,
 * y tiene que llegar antes que el `focus` que dispara el mismo `keydown` de Tab.
 * ---------------------------------------------------------------------------------------------- */
let focusOpenAllowed = false
let modalityListeners = 0

function onDocumentKeyDownCapture(event: KeyboardEvent): void {
  // `Shift+Tab` también es `key === 'Tab'`. Cualquier otra tecla desarma.
  focusOpenAllowed = event.key === 'Tab'
}

function onDocumentPointerDownCapture(): void {
  focusOpenAllowed = false
}

/** Suscripción refcontada: un solo par de listeners para toda la página, y se van con el último spark. */
function subscribeInputModality(): () => void {
  if (typeof document === 'undefined') return () => {}
  modalityListeners += 1
  if (modalityListeners === 1) {
    document.addEventListener('keydown', onDocumentKeyDownCapture, true)
    document.addEventListener('pointerdown', onDocumentPointerDownCapture, true)
  }
  return () => {
    modalityListeners -= 1
    if (modalityListeners === 0) {
      focusOpenAllowed = false
      document.removeEventListener('keydown', onDocumentKeyDownCapture, true)
      document.removeEventListener('pointerdown', onDocumentPointerDownCapture, true)
    }
  }
}

export function MacroSparkPopover({
  calories,
  proteinG,
  carbsG,
  fatsG,
  size = 'md',
  hideUnit = false,
  className,
  fiberG,
  targetCalories,
  ariaContext,
  per100 = false,
  basisLabel = null,
}: MacroSparkPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const finePointer = useFinePointer()
  const instanceId = React.useId()

  const close = React.useCallback(() => {
    setOpen(false)
    releaseActiveSpark(instanceId)
  }, [instanceId])

  const setOpenCoordinated = React.useCallback(
    (next: boolean) => {
      if (next) claimActiveSpark(instanceId, close)
      else releaseActiveSpark(instanceId)
      setOpen(next)
    },
    [instanceId, close],
  )

  // Al desmontar (fila borrada, franja contraída, lista virtualizada) el slot activo se libera.
  React.useEffect(() => () => releaseActiveSpark(instanceId), [instanceId])

  // Modalidad de entrada para el open-por-foco (ver bloque de arriba).
  React.useEffect(subscribeInputModality, [])

  // Cierre por scroll del contenedor: `scroll` no burbujea, así que se escucha en CAPTURA sobre
  // window para atrapar el de cualquier ancestro con overflow (canvas del editor, paleta, sheet).
  React.useEffect(() => {
    if (!open) return
    const onScrollCapture = () => close()
    window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onScrollCapture, { capture: true })
  }, [open, close])

  const hasMacros =
    Math.max(0, proteinG ?? 0) + Math.max(0, carbsG ?? 0) + Math.max(0, fatsG ?? 0) > 0
  const protein = fmtGrams(proteinG)
  const carbs = fmtGrams(carbsG)
  const fats = fmtGrams(fatsG)

  // `basisLabel` explícito manda sobre `per100` (ver comentario del tipo, NUT-001).
  const basisText = basisLabel ?? (per100 ? COPY.per100 : null)

  const ariaLabel = [
    hasMacros ? COPY.aria(protein, carbs, fats) : COPY.ariaNoMacros,
    ariaContext,
    basisText,
  ]
    .filter(Boolean)
    .join(' — ')

  const pctOfTarget =
    targetCalories != null && targetCalories > 0
      ? Math.round((Math.max(0, calories) / targetCalories) * 100)
      : null

  return (
    <Popover open={open} onOpenChange={setOpenCoordinated}>
      <PopoverTrigger
        aria-label={ariaLabel}
        // Hover + foco SOLO en puntero fino (SPEC D3). En puntero grueso queda el click del
        // trigger, que es el tap. `delay` 120 ms: intención, no roce; `closeDelay` da tiempo a
        // llevar el puntero al panel.
        openOnHover={finePointer}
        delay={120}
        closeDelay={80}
        onFocus={(event) => {
          if (!finePointer) return
          // `focusOpenAllowed`: solo un Tab/Shift+Tab REAL abre por foco. Sin esto, el foco que Base
          // UI devuelve al cerrar reabría el popover al instante (ver bloque «Modalidad de entrada»).
          if (!focusOpenAllowed) return
          if (!(event.target instanceof HTMLElement) || !event.target.matches(':focus-visible')) {
            return
          }
          setOpenCoordinated(true)
        }}
        onBlur={(event) => {
          const next = event.relatedTarget
          // El foco que entra al propio panel no cierra nada; cualquier otro blur sí.
          if (next instanceof HTMLElement && next.closest('[data-slot="popover-content"]')) return
          close()
        }}
        // Hit-area táctil ≥44×28 px aunque la barra mida 38×5: el padding es invisible y el margen
        // negativo lo compensa para no correr el layout de la fila.
        className={cn(
          '-mx-1 inline-flex min-h-7 min-w-11 cursor-pointer items-center justify-end rounded-control px-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <MacroSpark
          calories={calories}
          proteinG={proteinG}
          carbsG={carbsG}
          fatsG={fatsG}
          size={size}
          hideUnit={hideUnit}
        />
      </PopoverTrigger>

      <PopoverContent
        aria-label={ariaLabel}
        side="top"
        align="end"
        // Panel de LECTURA: no mueve el foco ni al abrir ni al cerrar. El foco se queda donde estaba
        // (el trigger, o el campo que el coach venía editando). Sin esto Base UI lo empujaba al panel
        // y lo devolvía al trigger al cerrar, y esa devolución reabría el popover — ver el bloque
        // «Modalidad de entrada». No hay nada tabulable adentro, así que no se pierde nada.
        initialFocus={false}
        finalFocus={false}
        className="w-auto max-w-60 gap-1 p-2.5"
      >
        {hasMacros ? (
          <p className="font-mono text-[11px] font-semibold tabular-nums text-strong">
            {COPY.macros(protein, carbs, fats)}
          </p>
        ) : (
          <p className="text-[11px] font-semibold text-muted">{COPY.noMacros}</p>
        )}

        {fiberG != null ? (
          <p className="font-mono text-[11px] tabular-nums text-body">
            {COPY.fiber(fmtGrams(fiberG))}
          </p>
        ) : null}

        {pctOfTarget != null ? (
          <p className="font-mono text-[11px] tabular-nums text-muted">
            {COPY.pctOfTarget(pctOfTarget)}
          </p>
        ) : null}

        {basisText ? <p className="text-[10px] text-subtle">{basisText}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
