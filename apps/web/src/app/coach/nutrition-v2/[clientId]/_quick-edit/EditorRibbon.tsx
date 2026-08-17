'use client'

/**
 * Cinta del EDITOR UNICO (T3.v Cabina, V2.1/V2.2/V2.5 — mockup «Cabina v2» §00 y A·1/A·5).
 *
 * Es el header del editor en tablet+desktop (≥768, contrato responsive de la SPEC): reemplaza a la
 * cabecera compacta móvil y le da al coach, en UNA línea, las tres cosas que antes estaban
 * desparramadas por el lienzo:
 *
 *  - **identidad** — ✕ salir (el MISMO `requestExit` del header móvil), eyebrow, «{alumno} · {plan}»
 *    y la `StrategyBadge`;
 *  - **diagnóstico del día activo** — anillo con el % de kcal (semántico: verde en banda, ámbar
 *    pasado de la meta) + tres micro-barras P/C/G con el token de color de cada macro;
 *  - **acciones** — «Metas del día ▾» (popover que HOSPEDA `TargetsEditorCard`), «Descartar»,
 *    «Publicar cambios» y el contador `aria-live` de cambios sin publicar.
 *
 * Regla de la tanda: CERO lógica nueva. Los datos salen de `dayTotals` (lo que ya calcula
 * `QuickEditPlanView` para la `PublishBar`) y todos los handlers/estados vienen del contexto
 * (`useQuickEdit`) — son literalmente los mismos que usa la `PublishBar`, que en ≥768 se queda
 * solo con la zona de totales para que no haya doble CTA de publicar/descartar en ningún ancho.
 *
 * V2.5 (pasada responsive): la cinta se montó primero SOLO ≥1024 (V2.1); la tabla responsive de la
 * SPEC la extiende a 768–1023 en variante COMPACTA (anillo 40 px). En <768 esta cinta no existe:
 * manda el header compacto de siempre + `PublishBar` completa (el "mini-cinta móvil" de la SPEC,
 * PLAN §3 — mismo componente).
 *
 * V2.6 (fix F1 del QA visual): en 768–1023 la variante compacta intentaba meter TODO y el ancho no
 * daba — la `StrategyBadge` se pintaba encima del anillo y las micro-barras P/C/G quedaban tapadas
 * por «Metas del día». El presupuesto de la cinta compacta es ahora explícito y son SOLO estas
 * piezas: ✕ · alumno (truncable) · anillo · kcal x/meta · «Metas del día» · «Descartar» ·
 * «Publicar» · contador. La badge y las micro-barras vuelven recién en `lg:` (1024), donde el
 * diagnóstico completo sí entra. Además el track del centro dejó de poder colapsar
 * (`minmax(min-content,1fr)`): antes, con `minmax(0,1fr)`, el track se achicaba por debajo de su
 * contenido y el `justify-center` derramaba el anillo/barras HACIA AFUERA, montándose sobre los
 * vecinos sin que ningún gate de overflow-x lo notara. Con el piso `min-content` un ancho
 * insuficiente empuja la barra (overflow del body, que sí está asertado) en vez de superponer.
 */

import { useState, useSyncExternalStore } from 'react'
import { ChevronDown, Loader2, X } from 'lucide-react'
import type { QeVariant } from '@eva/nutrition-v2'
import { StrategyBadge } from '@/components/nutrition-v2'
import { MACRO_META, macroPct } from '@/components/nutrition/macro-tokens'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useQuickEdit } from './QuickEditProvider'
import { TargetsEditorCard } from './TargetsEditorCard'
import { DAY_MACRO_ROWS, type PublishBarDayTotals } from './PublishBar'
import { QE_COPY } from './microcopy'

/* ------------------------------------------------------------------------------------------------
 * ¿Estamos en el ancho de la cinta? `48rem` es EXACTAMENTE el breakpoint `md:` de Tailwind v4 (se
 * escribe en rem a propósito: con px el media query se desincronizaría de las utilidades `md:` en
 * navegadores con tamaño de fuente base distinto de 16 px). V2.5 bajó el umbral de `lg:` (64rem) a
 * `md:` (48rem) por la fila 768–1023 del contrato responsive de la SPEC: ahí la cinta existe en su
 * variante compacta (ver `RibbonDayReadout`); el rail y la paleta de 3 zonas siguen exclusivos de
 * `lg:` (1024, ver `QuickEditPlanView`/`EditorDayRail`/`EditorPalette`).
 *
 * `useSyncExternalStore` con snapshot de servidor `false` — mismo patrón que `use-reduced-motion` y
 * que el gate de puntero fino de `MacroSparkPopover`: durante la hidratación el valor coincide con
 * el HTML servido (móvil) y recién después se lee el media query real, así que no hay familia de
 * mismatch EVA-NEXTJS-18. El parpadeo se evita en `QuickEditPlanView`, que además marca `md:hidden`
 * las piezas móviles: antes de hidratar, en tablet/desktop, no se pinta el header que va a desaparecer.
 * ---------------------------------------------------------------------------------------------- */
const RIBBON_QUERY = '(min-width: 48rem)'

function subscribeRibbonViewport(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(RIBBON_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getRibbonViewportSnapshot(): boolean {
  return window.matchMedia(RIBBON_QUERY).matches
}

function getRibbonViewportServerSnapshot(): boolean {
  return false
}

/** `true` cuando el viewport está en el rango de la cinta (≥768 / `md:`). */
export function useRibbonViewport(): boolean {
  return useSyncExternalStore(
    subscribeRibbonViewport,
    getRibbonViewportSnapshot,
    getRibbonViewportServerSnapshot,
  )
}

/* ------------------------------------------------------------------------------------------------
 * Anillo de kcal del día activo.
 *
 * ES el único lugar de la tanda con semántica de color por estado (la `PublishBar` y las barras de
 * macro pintan SIEMPRE el token de su macro, ver V1.3): verde = el día cae en la banda de la meta,
 * ámbar = se pasó, y mientras todavía falta comida el arco va en el color de marca — «te falta» no
 * es un error. Sin meta de kcal el anillo queda en puro track: no se inventa un porcentaje.
 * ---------------------------------------------------------------------------------------------- */
/** Piso de la banda «en meta»: de acá a 100 % el día se considera cerrado (verde). */
const RING_BAND_FLOOR_PCT = 90

// Geometría en coordenadas del viewBox (42×42, trazo 4): el tamaño RENDERIZADO responsive vive en
// las clases Tailwind del wrapper (`KcalRing`, abajo) — 40 px en la variante compacta 768–1023,
// 42 px desde `lg:` (contrato responsive V2.5). El SVG escala el dibujo entero contra el viewBox,
// así que no hace falta recalcular radio/trazo por breakpoint.
const RING_SIZE = 42
const RING_STROKE = 4

function ringToneClass(pct: number | null): string {
  if (pct === null) return 'text-muted'
  if (pct > 100) return 'text-warning-500'
  if (pct >= RING_BAND_FLOOR_PCT) return 'text-macro-goal'
  return 'text-primary'
}

function KcalRing({ pct }: { pct: number | null }) {
  const radius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  // El arco se clampea a la vuelta completa; el número de arriba sí dice el 112 % real.
  const filled = circumference * Math.min(Math.max(pct ?? 0, 0), 100) / 100

  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center lg:h-[42px] lg:w-[42px]">
      <svg aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          className="text-muted"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track-strong)"
          strokeWidth={RING_STROKE}
        />
        {pct === null ? null : (
          <circle
            className={ringToneClass(pct)}
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        )}
      </svg>
      {pct === null ? null : (
        <span aria-hidden="true" className="absolute font-mono text-[9.5px] font-semibold tabular-nums text-strong">
          {Math.round(pct)}%
        </span>
      )}
    </span>
  )
}

/**
 * Centro de la cinta: anillo + kcal del día + micro-barras P/C/G (mockup A·1).
 *
 * Las micro-barras son `lg:` en adelante (fix F1): en 768–1023 no hay ancho para ellas y lo que
 * hacían era meterse debajo de «Metas del día». El anillo + «x / meta» sí sobreviven en compacto —
 * es el diagnóstico mínimo del día y el único dato que la cinta no repite en ningún otro lado.
 */
function RibbonDayReadout({ dayTotals }: { dayTotals: PublishBarDayTotals }) {
  const target = dayTotals.targetCalories
  const pct = target != null && target > 0 ? (Math.max(0, dayTotals.calories) / target) * 100 : null
  const calories = Math.round(dayTotals.calories)
  // Nombre accesible del bloque entero: el anillo, el rótulo y la cifra son UNA sola lectura.
  const readoutLabel = [
    dayTotals.label,
    target != null ? `${calories} de ${Math.round(target)} kcal` : `${calories} kcal`,
    pct != null ? QE_COPY.sparkPctOfTarget(Math.round(pct)) : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <div className="flex min-w-0 items-center justify-center gap-2.5 xl:gap-5">
      <div role="img" aria-label={readoutLabel} className="flex shrink-0 items-center gap-2">
        <KcalRing pct={pct} />
        <span className="flex flex-col gap-px">
          {/* 768–1279 va solo «KCAL»: el nombre del día ya lo dicen el encabezado del lienzo y la
              barra de totales, y ahí el presupuesto de ancho de la cinta es todo (riesgo 5 SPEC). */}
          <span className="font-mono text-[9px] font-semibold uppercase leading-3 tracking-[0.12em] text-muted">
            {dayTotals.label ? <span className="hidden xl:inline">{dayTotals.label} · </span> : null}
            kcal
          </span>
          <span className="font-mono text-[13px] font-semibold leading-4 tabular-nums text-strong">
            {calories}
            {target != null ? (
              <span className="font-medium text-muted"> / {Math.round(target)}</span>
            ) : null}
          </span>
        </span>
      </div>

      {/* El ancho vive en la GRILLA, no en cada columna (fix F1): con `w-[58px]` por columna, al
          apretarse la cinta las columnas conservaban su ancho fijo y se derramaban fuera de sus
          tracks (`grid-cols-3` = `minmax(0,1fr)`), que es como las barras terminaban debajo de los
          botones. Ahora la grilla mide 3×58+2×12 (y 3×70+2×12 en `xl:`) — los MISMOS píxeles que
          V2.1 tenía calibrados — y al achicarse arrastra a sus columnas, que truncan. */}
      <div className="hidden min-w-0 shrink grid-cols-3 gap-x-3 lg:grid lg:w-[198px] xl:w-[234px]">
        {DAY_MACRO_ROWS.map(({ key, actual, target: targetField }) => {
          const meta = MACRO_META[key]
          const actualValue = dayTotals[actual]
          const targetValue = dayTotals[targetField]
          const barPct = targetValue != null ? macroPct(actualValue, targetValue) : 0
          return (
            <div key={key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="shrink-0 font-mono text-[9.5px] font-semibold" style={{ color: meta.color }}>
                  {meta.short}
                </span>
                {/* `min-w-0` para que el truncate funcione DENTRO del flex: sin él, un «188/160»
                    largo se desbordaba de su columna y se montaba sobre los botones (1024). */}
                <span className="min-w-0 truncate font-mono text-[9.5px] font-semibold tabular-nums text-strong">
                  {Math.round(actualValue)}
                  {targetValue != null ? `/${Math.round(targetValue)}` : ''}
                </span>
              </div>
              {/* Barra decorativa: los números de arriba ya son el texto accesible. */}
              <div aria-hidden="true" className="mt-1 flex h-1 overflow-hidden rounded-pill bg-surface-sunken">
                <div className="h-full rounded-pill" style={{ width: `${barPct}%`, backgroundColor: meta.color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Botón de la cinta (36 px de alto; 44 en puntero grueso — SPEC «touch targets ≥44 px en TODOS los
 * controles nuevos»: un desktop táctil entra por `lg:` igual que un mouse).
 */
const RIBBON_BUTTON =
  'inline-flex min-h-9 items-center justify-center gap-1 whitespace-nowrap rounded-control border border-border-default bg-surface-card px-2.5 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 xl:px-3 [@media(pointer:coarse)]:min-h-11'

export function EditorRibbon({
  eyebrow,
  title,
  planName,
  variant,
  dayTotals,
}: {
  /** Eyebrow del overlay ya resuelto por la vista (editar / nuevo plan / plantilla). */
  eyebrow: string
  /** Alumno (o nombre de la plantilla). */
  title: string
  /** Nombre del plan que acompaña al del alumno; `null` en plantilla (ahí el título YA es el nombre). */
  planName: string | null
  /** Día activo: sin él no hay metas que editar ni totales que mostrar (la cinta igual da la salida). */
  variant: QeVariant | null
  dayTotals: PublishBarDayTotals | null
}) {
  const {
    strategy,
    surface,
    state,
    errors,
    showErrors,
    changeCount,
    isPending,
    substitutionsFailed,
    requestExit,
    discardChanges,
    openConfirm,
  } = useQuickEdit()
  const [metasRequested, setMetasRequested] = useState(false)

  // Vocabulario: idéntico al de la PublishBar (plantilla guarda, creación publica el plan nuevo).
  const isTemplate = surface === 'template'
  const isCreation = state.meta?.effectiveFrom !== undefined
  const ctaLabel = isTemplate ? QE_COPY.templateSave : isCreation ? QE_COPY.createPublish : QE_COPY.publish
  const dirtyLabel = isTemplate ? QE_COPY.templateDirtyBar(changeCount) : QE_COPY.dirtyBar(changeCount)

  // Un error de metas dentro de un popover cerrado sería invisible: se fuerza abierto mientras dure
  // (mismo patrón `forcedOpen` de `EditorMetaCard`, que abre la card cuando el nombre/vigencia falla).
  const targetsInvalid =
    variant !== null &&
    showErrors &&
    Object.keys(errors).some((key) => key.startsWith(`target.${variant.key}.`))
  const metasOpen = metasRequested || targetsInvalid

  return (
    <header
      data-testid="editor-ribbon"
      /* Guía Viva (paso 1 del guion del editor ≥768). Los `data-tour` de este archivo son SOLO
         anclas del tour: no cambian estilos ni comportamiento de la cinta, y su ausencia solo hace
         que ese paso pinte la tarjeta al centro sin recorte. Ver `components/nutrition-v2/tour/`. */
      data-tour="ribbon"
      /* Regla del dueño 17-08 (con el sello dentro del editor): la cinta queda OPACA — negra o
         blanca según el tema — jamás translúcida sobre los blobs (mismo criterio que el chrome
         del shell, SPEC D2). Muere el backdrop-blur. */
      className="sticky top-0 z-20 border-b border-border-subtle bg-surface-app"
    >
      {/* Pisos de track EXPLÍCITOS (fix F1). Identidad y centro pueden encogerse, pero nunca por
          debajo de su `min-content`: la identidad llega hasta ✕ + nombre en elipsis, el centro
          hasta anillo + cifra. Con `minmax(0,…)` en ambos, un ancho corto colapsaba los tracks y
          el contenido (que es `shrink-0`) se derramaba encima del vecino. Las acciones son `auto`:
          los CTA no se truncan ni se apilan jamás. */}
      <div className="mx-auto grid w-full max-w-[110rem] grid-cols-[minmax(min-content,auto)_minmax(min-content,1fr)_auto] items-center gap-2 px-3 py-2 xl:gap-5 xl:px-4">
        {/* ── Identidad: salir + quién/qué se está editando.
            El tope de ancho en 1024–1279 es a propósito: entre truncar un nombre (que el coach ya
            sabe de memoria) y apretar los números del día hasta la elipsis, se trunca el nombre. */}
        <div className="flex min-w-0 max-w-[18rem] items-center gap-2 xl:max-w-none xl:gap-2.5">
          <button
            type="button"
            /* Misma etiqueta que el ✕ del header móvil (QE_COPY no tiene clave para esta). */
            aria-label="Salir del modo edición"
            onClick={requestExit}
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-strong transition-colors hover:bg-surface-card active:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-mono text-[9px] font-semibold uppercase leading-4 tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
            {/* El header móvil pone el <h1> del overlay; en desktop lo pone la cinta. */}
            <h1 className="truncate font-display text-[15px] font-bold leading-tight tracking-[-0.02em] text-strong">
              {title}
              {planName ? <span className="font-medium text-muted"> · {planName}</span> : null}
            </h1>
          </div>
          {/* `lg:` en adelante (fix F1): en la cinta compacta 768–1023 la badge era lo primero que
              se montaba sobre el anillo, y la estrategia ya se lee en la card de plan del lienzo. */}
          <div className="hidden shrink-0 lg:block">
            <StrategyBadge strategy={strategy} compact />
          </div>
        </div>

        {/* ── Diagnóstico del día activo (mismos totales que la PublishBar). */}
        {dayTotals ? <RibbonDayReadout dayTotals={dayTotals} /> : <div />}

        {/* ── Acciones: mismos handlers y estados que la PublishBar (ella los oculta en ≥768). */}
        <div className="flex shrink-0 items-center gap-1.5 xl:gap-2">
          {variant ? (
            <Popover
              open={metasOpen}
              onOpenChange={(next: boolean) => setMetasRequested(next)}
            >
              {/* Paso 2 del guion: «Metas sin salir del flujo». `PopoverTrigger` reenvía los props
                  al botón que renderiza, así que el ancla queda sobre el control real. */}
              <PopoverTrigger data-tour="metas" className={RIBBON_BUTTON}>
                {QE_COPY.metasPopover}
                <ChevronDown
                  aria-hidden="true"
                  className={'h-3.5 w-3.5 text-muted transition-transform ' + (metasOpen ? 'rotate-180' : '')}
                />
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                className="w-[26rem] max-w-[calc(100vw-2rem)] gap-3 p-3.5"
              >
                <PopoverTitle className="font-display text-base font-semibold text-strong">
                  {QE_COPY.metasPopover}
                </PopoverTitle>
                {/* MISMA card de siempre: mismos steppers, mismos dispatches (SET_TARGET /
                    STEP_TARGET), mismos errores. Lo único que cambia es el host. */}
                <TargetsEditorCard variant={variant} chrome="bare" />
              </PopoverContent>
            </Popover>
          ) : null}

          <button
            type="button"
            onClick={discardChanges}
            /* Sin cambios no hay nada que descartar (`discardChanges` con el draft limpio sale del
               editor, y una salida no anunciada desde un botón «Descartar» sería una trampa). */
            disabled={isPending || changeCount === 0}
            className={RIBBON_BUTTON}
          >
            {QE_COPY.discard}
          </button>

          <div className="flex flex-col items-end gap-0.5">
            <button
              type="button"
              /* Último paso del guion: «Publica y ya llegó». En <768 la cinta no existe y el ancla
                 la lleva la PublishBar (ver `PublishBar`), así que nunca hay dos a la vez. */
              data-tour="publicar"
              onClick={openConfirm}
              disabled={isPending || changeCount === 0 || substitutionsFailed}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-primary/100 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 xl:px-3.5 [@media(pointer:coarse)]:min-h-11"
            >
              {isPending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
              {ctaLabel}
            </button>
            {/* Región viva SIEMPRE montada (si apareciera junto con el texto, el lector no lo
                anunciaría). Con 0 cambios queda vacía pero reserva su línea. */}
            <p aria-live="polite" className="min-h-[13px] font-mono text-[9.5px] leading-3 text-muted">
              {changeCount > 0 ? dirtyLabel : ''}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
