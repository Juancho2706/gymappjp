'use client'

/**
 * "Agregar día" (SPEC nutrition-multiday, UX 1).
 *
 * SUPERFICIE VIVA: la **edición rápida** (`_quick-edit/QuickEditPlanView`). El creador ya NO lo
 * monta: ahí el alta de un día se hace tocando su celda en el strip Lu-Do y "Personalizar"
 * (SPEC nutrition-ui-poda, punto 10 — "tocas el día, no la variante"). De este módulo el creador
 * sigue usando `useIsDesktopMd` y `UpsellPanel`.
 *
 * Popover en desktop / bottom sheet en móvil (mismo patrón split que `PortionsGroupPicker`,
 * copiado para no acoplar módulos): selector Lu-Do MULTI-SELECT con los días ya ocupados
 * deshabilitados, origen del contenido (copiar el día base o empezar vacío) y CTA
 * "Crear N días". Un solo viaje crea Sa+Do de una.
 *
 * Coach FREE (sin plan pago): el trigger lleva candado y el panel explica el límite inline en vez
 * del selector. La barrera REAL es el servidor (`publishPlanAction` responde `UPGRADE_REQUIRED`
 * con feature `multi_variant`); esto solo evita el callejón sin salida.
 */

import { useState, useSyncExternalStore, type HTMLAttributes, type Ref } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_WEEK_ORDER,
} from '@eva/nutrition-v2'
import { AddActionButton, useBrandPrimaryHex } from '@/components/nutrition-v2'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// matchMedia md-up: desktop => popover, móvil => bottom sheet. Copiado de
// `PortionsGroupPicker` (misma decisión, módulos disjuntos a propósito).
function subscribeMd(cb: () => void) {
  const mq = window.matchMedia('(min-width: 768px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/**
 * Compartido con el menú "Copiar a otros días" del builder (`PlanBuilderClient`): las dos
 * afordancias del paso de los días abren popover en desktop y bottom sheet en móvil, así que
 * el hook se exporta en vez de copiarse una tercera vez.
 */
export function useIsDesktopMd(): boolean {
  return useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia('(min-width: 768px)').matches,
    () => true,
  )
}

// Ruta canónica de upgrade. Se inlinea (igual que en PlanBuilderClient) porque
// `_lib/nutrition-pro.ts` es server-only y no puede importarse en un client component.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'

export type AddDayOrigin = 'copy-base' | 'empty'

/**
 * Props que el `render` del trigger de Base UI reenvía al elemento (handlers, atributos de
 * accesibilidad y la ref del anchor). Espeja `HTMLProps` del paquete, que no se exporta.
 */
type TriggerRenderProps = HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }

/** Orden de lectura Lu→Do como `number[]` (el del paquete es una tupla literal readonly). */
const WEEK_ORDER: number[] = [...NUTRITION_WEEK_ORDER]

/**
 * Panel de "dias distintos" para el coach FREE. Se EXPORTA porque el selector de dia del creador
 * (`DayPlanStrip`) lo reusa tal cual cuando toca "Personalizar {dia}": es el mismo limite
 * comercial contado con las mismas palabras, en el mismo popover/sheet.
 *
 * NO es un upsell de modulo: los modulos ya no se compran sueltos, vienen con CUALQUIER plan
 * pago de EVA. Por eso el CTA es "Ver planes" y apunta a la suscripcion.
 */
export function UpsellPanel() {
  return (
    <div className="flex items-start gap-2.5 p-1">
      {/* Ícono del módulo de nutrición avanzada (asset del CEO, estático @2x). */}
      <Image
        src="/module-icons/nutrition-pro@2x.webp"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 shrink-0 object-contain"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-strong">Días distintos</p>
        <p className="text-xs leading-relaxed text-muted">
          Armar un día especial (por ejemplo, el fin de semana) viene incluido en cualquier plan pago de EVA. Tu
          plan actual publica un solo día para toda la semana.
        </p>
        <Link
          href={NUTRITION_PRO_UPGRADE_HREF}
          className="inline-flex min-h-9 items-center text-xs font-semibold text-primary underline underline-offset-2"
        >
          Ver planes
        </Link>
      </div>
    </div>
  )
}

function DaySelector({
  takenDays,
  canCopyBase,
  onCreate,
}: {
  takenDays: readonly number[]
  canCopyBase: boolean
  onCreate: (days: number[], origin: AddDayOrigin) => void
}) {
  const [selected, setSelected] = useState<number[]>([])
  const [origin, setOrigin] = useState<AddDayOrigin>(canCopyBase ? 'copy-base' : 'empty')
  const taken = new Set(takenDays)
  const allTaken = NUTRITION_WEEK_ORDER.every((day) => taken.has(day))

  function toggle(day: number) {
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  if (allTaken) {
    return (
      <p className="p-2 text-xs leading-relaxed text-muted">
        Ya tienes los siete días definidos por separado. Elimina alguno para volver a usar el día base.
      </p>
    )
  }

  return (
    <div className="space-y-3 p-1">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Elige los días</p>
        <div className="flex flex-wrap gap-1.5">
          {NUTRITION_WEEK_ORDER.map((day) => {
            const isTaken = taken.has(day)
            const isOn = selected.includes(day)
            return (
              <button
                key={day}
                type="button"
                disabled={isTaken}
                aria-pressed={isOn}
                title={isTaken ? `${NUTRITION_DAY_LABELS[day]} ya tiene su propio día` : NUTRITION_DAY_LABELS[day]}
                onClick={() => toggle(day)}
                className={
                  'inline-flex h-11 min-w-11 items-center justify-center rounded-control border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isTaken
                    ? 'cursor-not-allowed border-border-subtle bg-surface-sunken text-subtle opacity-60'
                    : isOn
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-default bg-surface-card text-strong hover:border-primary/40')
                }
              >
                {NUTRITION_DAY_SHORT_LABELS[day]}
              </button>
            )
          })}
        </div>
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Contenido inicial</legend>
        {([
          ['copy-base', 'Copiar el día base (comidas y porciones)'],
          ['empty', 'Empezar vacío'],
        ] as const).map(([value, label]) => (
          <label
            key={value}
            className={
              'flex min-h-11 items-center gap-2 rounded-control px-1 text-sm text-body ' +
              (value === 'copy-base' && !canCopyBase ? 'opacity-50' : '')
            }
          >
            <input
              type="radio"
              name="add-day-origin"
              className="h-4 w-4 accent-[var(--theme-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              checked={origin === value}
              disabled={value === 'copy-base' && !canCopyBase}
              onChange={() => setOrigin(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => onCreate([...selected].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)), origin)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {selected.length <= 1 ? 'Crear día' : `Crear ${selected.length} días`}
      </button>
    </div>
  )
}

export function AddDayPopover({
  takenDays,
  canCopyBase,
  locked,
  onCreate,
}: {
  /** Días de semana que ya tienen su propia variante (0=domingo … 6=sábado). */
  takenDays: readonly number[]
  /** El día base tiene contenido que valga la pena clonar. */
  canCopyBase: boolean
  /** Coach free (sin plan pago): candado + panel explicativo en vez del selector. */
  locked: boolean
  onCreate: (days: number[], origin: AddDayOrigin) => void
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktopMd()
  const brandHex = useBrandPrimaryHex()

  function handleCreate(days: number[], origin: AddDayOrigin) {
    onCreate(days, origin)
    setOpen(false)
  }

  const body = locked ? (
    <UpsellPanel />
  ) : (
    <DaySelector takenDays={takenDays} canCopyBase={canCopyBase} onCreate={handleCreate} />
  )

  const triggerLabel = locked
    ? 'Agregar un día distinto al plan (incluido en los planes pagos)'
    : 'Agregar un día distinto al plan'
  const triggerTitle = locked ? 'Días distintos: incluido en cualquier plan pago' : undefined

  // T3.v Cabina «Familia N»: el trigger pasa a ser la pastilla única de alta, punteada (hueco por
  // llenar) y con el ícono ilustrado del día. Cambia SOLO la presentación: el popover/sheet, el
  // `aria-label`, el `title` y el gate del plan son los mismos de siempre.
  //
  // Límite LEGIBLE antes de abrir (P1-7): la pastilla "Plan pago" sigue viva al lado del botón —
  // la Familia N no admite hijos (su nombre accesible ES el label), así que el badge sale del
  // botón y queda como hermano. El `aria-label` del propio botón ya cuenta el límite, así que el
  // badge no aporta información nueva a un lector de pantalla.
  // `HTMLProps` de Base UI (props del trigger + su ref) es exactamente lo que hay que reenviar.
  const familyTrigger = (props: TriggerRenderProps = {}) => (
    <AddActionButton
      {...props}
      icon="dia"
      variant="dashed"
      label="Agregar día"
      brandColor={brandHex}
      aria-label={triggerLabel}
      title={triggerTitle}
      data-testid="qe-add-day"
    />
  )
  const lockedBadge = locked ? (
    <span
      aria-hidden="true"
      className="rounded-pill border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary dark:border-primary/40 dark:bg-primary/15"
    >
      Plan pago
    </span>
  ) : null

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {/* `render` (Base UI) en vez de un botón propio: el trigger sigue recibiendo sus props
              de accesibilidad y su ref del popover — solo cambia el elemento que las lleva. */}
          <PopoverTrigger render={(triggerProps) => familyTrigger(triggerProps)} />
          {lockedBadge}
        </span>
        <PopoverContent
          align="start"
          className="w-80 rounded-card border border-border-subtle bg-surface-card p-2 text-body shadow-lg"
        >
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {familyTrigger({ onClick: () => setOpen(true) })}
        {lockedBadge}
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
              Agregar día
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
