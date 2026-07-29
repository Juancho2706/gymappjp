'use client'

/**
 * Selector de día del creador — "tocas el día, no la variante"
 * (SPEC nutrition-ui-poda punto 10; mockup aprobado `mockup-selector-dias.html`).
 *
 * Reemplaza la fila de pastillas de variantes + "Agregar día" + la tira "Se aplica en" por UN
 * strip de 7 celdas Lu-Do (día de semana, sin fechas):
 *
 *  - cada celda trae la inicial del día, las kcal que ese día recibe y un punto de estado:
 *    LLENO = día con contenido propio, HUECO = sigue el día base;
 *  - la celda del día en pantalla lleva el acento de la marca; un día cuya validación falló se
 *    marca en tono destructivo (ola 2, ahora sobre la celda: el paso monta solo las franjas del
 *    día elegido, así que un item incompleto de otro día bloqueaba "Publicar" sin señal);
 *  - debajo, la barra de contexto dice SIEMPRE qué se está editando:
 *      · día heredado → "Estás editando el día base · Se aplica a Lu · Mi · Ju · Vi" + CTA
 *        "Personalizar el martes" (crea el día propio copiando el base; candado Pro si aplica);
 *      · día propio → nombre + "kcal / meta" del día + menú ⋮ (Renombrar · Cambiar día ·
 *        Objetivos propios · Copiar a otros días · Eliminar día).
 *
 * Celdas: se construyen con `builderDayCells` (`_lib/draft-builder`) sobre el tipo COMPARTIDO
 * `NutritionPlanDowCell` del paquete, y el copy/formato de kcal y el `aria-label` salen de los
 * helpers compartidos — así el creador, la ficha del coach y RN dicen exactamente lo mismo del
 * mismo plan. No monta `PlanDowSelector` (el componente del kit) por dos capacidades que hoy no
 * tiene y el creador necesita: marcar celdas con error y seleccionar el día base cuando ya no rige
 * ningún día (`selectedDow` null). Cuando el kit las acepte, este strip debe consumirlo.
 *
 * Gemelo RN: `apps/mobile/components/nutrition-v2/BuilderDayStrip.tsx`.
 * Presentacional: no despacha nada, avisa por `handlers`.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, Lock, MoreVertical, Pencil, Sliders, Trash2, X } from 'lucide-react'
import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_PLAN_DOW_LEGEND,
  NUTRITION_WEEK_ORDER,
  formatNutritionCalories,
  formatNutritionPlanDowCalories,
  formatNutritionPlanDowCellAccessibilityLabel,
} from '@eva/nutrition-v2'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  MAX_DAY_VARIANTS,
  autoVariantLabel,
  builderVariantForDayOfWeek,
  takenDayOfWeeks,
  type BuilderDayCell,
  type BuilderState,
  type BuilderTargets,
  type BuilderTargetsMode,
  type BuilderVariant,
} from '../_lib/draft-builder'
// El candado Pro y el detector de desktop se reusan del módulo de "Agregar día" (que sigue vivo
// en la edición rápida): mismo límite comercial, mismas palabras, mismo popover/sheet.
import { UpsellPanel, useIsDesktopMd } from './AddDayPopover'

// Ruta canónica de upgrade: se inlinea (igual que en PlanBuilderClient/AddDayPopover) porque
// `_lib/nutrition-pro.ts` es server-only y no puede importarse en un client component.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'

const MACRO_FIELDS: Array<{ field: keyof BuilderTargets; label: string }> = [
  { field: 'calories', label: 'kcal' },
  { field: 'proteinG', label: 'P (g)' },
  { field: 'carbsG', label: 'C (g)' },
  { field: 'fatsG', label: 'G (g)' },
]

const macroInputClass =
  'min-h-9 w-full rounded-control border border-border-default bg-surface-card px-2 text-sm tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
const ghostButtonClass =
  'inline-flex min-h-9 items-center gap-1 rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const personalizeCtaClass =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Formato es-CL sin unidad, para el par "prescrito / meta" de la barra de contexto. */
const KCAL_FORMAT = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

export interface DayPlanStripHandlers {
  /** Selecciona un día del strip; `null` = el día base cuando ya no rige ningún día. */
  onSelectDay: (dayOfWeek: number | null) => void
  /**
   * Salta al día que recibe UNA variante. No lo usa el strip (que habla de días): lo consume el
   * aviso "Revisa este día" del paso, que conoce las variantes con errores.
   */
  onSelectVariant: (variantKey: string) => void
  /** Crea el día propio copiando el día base (la primitiva de alta de siempre). */
  onPersonalize: (dayOfWeek: number) => void
  onRename: (variantKey: string, label: string) => void
  onChangeDay: (variantKey: string, dayOfWeek: number) => void
  /** Copia el día completo a OTRO día (crea su variante con este contenido). */
  onCopyToDay: (variantKey: string, dayOfWeek: number) => void
  onSetTargetsMode: (variantKey: string, mode: BuilderTargetsMode) => void
  onSetVariantTarget: (variantKey: string, field: keyof BuilderTargets, value: string) => void
  onRemove: (variantKey: string) => void
}

/** "1.850 / 2.000 kcal" cuando el día tiene meta; solo "1.850 kcal" cuando no hay con qué comparar. */
function kcalLabel(value: number, targetCalories: number | null): string {
  const prescribed = Math.round(value)
  if (targetCalories == null || targetCalories <= 0) return formatNutritionCalories(prescribed)
  return KCAL_FORMAT.format(prescribed) + ' / ' + formatNutritionCalories(Math.round(targetCalories))
}

/** Título del día propio: "Sábado" o "Sábado · Día libre" cuando el coach le puso nombre. */
function ownDayTitle(variant: BuilderVariant): string {
  const auto = autoVariantLabel(variant.dayOfWeek)
  const label = variant.label.trim()
  return label === '' || label.toLocaleLowerCase() === auto.toLocaleLowerCase() ? auto : auto + ' · ' + label
}

/** "Lu · Mi · Ju · Vi" — los días que comparten el día base. */
function joinShortDays(days: readonly number[]): string {
  return days.map((dayOfWeek) => NUTRITION_DAY_SHORT_LABELS[dayOfWeek]).join(' · ')
}

/** Menú ⋮ del día propio: concentra lo que antes vivía repartido por pastilla. */
function DayMenu({
  variant,
  takenDays,
  canCopyToAnotherDay,
  onRenameRequest,
  handlers,
}: {
  variant: BuilderVariant
  takenDays: readonly number[]
  canCopyToAnotherDay: boolean
  onRenameRequest: () => void
  handlers: DayPlanStripHandlers
}) {
  const taken = new Set(takenDays)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Opciones de ${ownDayTitle(variant)}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border-0 bg-transparent p-0 normal-case tracking-normal text-muted hover:bg-surface-sunken hover:text-strong dark:bg-transparent"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onRenameRequest}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Renombrar
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Cambiar día</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {NUTRITION_WEEK_ORDER.map((day) => (
              <DropdownMenuItem
                key={day}
                disabled={taken.has(day) && day !== variant.dayOfWeek}
                onClick={() => handlers.onChangeDay(variant.key, day)}
              >
                {day === variant.dayOfWeek ? <Check aria-hidden="true" className="h-4 w-4 text-primary" /> : null}
                {NUTRITION_DAY_LABELS[day]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          onClick={() =>
            handlers.onSetTargetsMode(variant.key, variant.targetsMode === 'custom' ? 'inherit' : 'custom')
          }
        >
          <Sliders aria-hidden="true" className="h-4 w-4" />
          {variant.targetsMode === 'custom' ? 'Volver a los objetivos base' : 'Objetivos propios'}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canCopyToAnotherDay}>Copiar a otros días</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {NUTRITION_WEEK_ORDER.map((day) => (
              <DropdownMenuItem key={day} disabled={taken.has(day)} onClick={() => handlers.onCopyToDay(variant.key, day)}>
                <Copy aria-hidden="true" className="h-4 w-4" />
                {NUTRITION_DAY_LABELS[day]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => handlers.onRemove(variant.key)}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Eliminar día
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * CTA "Personalizar el {día}" con el candado Pro del coach BASE: el panel es el MISMO upsell que
 * usaba "Agregar día" (popover en desktop / bottom sheet en móvil).
 */
function PersonalizeCta({
  dayOfWeek,
  locked,
  onPersonalize,
}: {
  dayOfWeek: number
  locked: boolean
  onPersonalize: (dayOfWeek: number) => void
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktopMd()
  const dayLabel = NUTRITION_DAY_LABELS[dayOfWeek].toLocaleLowerCase()

  if (!locked) {
    return (
      <button type="button" onClick={() => onPersonalize(dayOfWeek)} className={personalizeCtaClass}>
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
        Personalizar el {dayLabel}
      </button>
    )
  }

  // Gate Pro LEGIBLE antes de abrir: candado + pastilla "Pro" en el propio botón.
  const trigger = (
    <>
      <Lock aria-hidden="true" className="h-3.5 w-3.5" />
      Personalizar el {dayLabel}
      <span className="rounded-pill border border-primary/30 bg-primary/10 px-1.5 text-[10px] font-bold uppercase tracking-wide text-primary dark:border-primary/40 dark:bg-primary/15">
        Pro
      </span>
    </>
  )
  const triggerLabel = `Personalizar el ${dayLabel}: incluido en Nutricion Pro`

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={triggerLabel}
          title="Días distintos: disponible con Nutrición Pro"
          className={personalizeCtaClass}
        >
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 rounded-card border border-border-subtle bg-surface-card p-2 text-body shadow-lg"
        >
          <UpsellPanel />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label={triggerLabel}
        title="Días distintos: disponible con Nutrición Pro"
        onClick={() => setOpen(true)}
        className={personalizeCtaClass}
      >
        {trigger}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
              Días distintos
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] pt-1">
            <UpsellPanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function DayPlanStrip({
  state,
  cells,
  selectedDow,
  inheritedDays,
  selectedKcal,
  personalizeLocked,
  errorByVariantKey,
  handlers,
}: {
  state: BuilderState
  /** Las 7 celdas ya resueltas (`builderDayCells`): el strip no vuelve a decidir qué recibe quién. */
  cells: readonly BuilderDayCell[]
  /** Día en pantalla; `null` = el día base cuando ya no rige ningún día. */
  selectedDow: number | null
  /** Días que heredan el día base, en orden de lectura (`inheritedDayOfWeeks`). */
  inheritedDays: readonly number[]
  /** kcal del día en pantalla (items + porciones, el mismo criterio del total del día). */
  selectedKcal: number
  /** Coach sin Nutrición Pro: "Personalizar" con candado + upsell. */
  personalizeLocked: boolean
  /** Días con algún error de validación, por `variant.key`: su celda se marca. */
  errorByVariantKey?: Record<string, string>
  handlers: DayPlanStripHandlers
}) {
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (renamingKey) renameRef.current?.focus()
  }, [renamingKey])

  const selectedVariant = builderVariantForDayOfWeek(state, selectedDow)
  const inherited = selectedVariant.isDefault
  const takenDays = useMemo(() => takenDayOfWeeks(state), [state])
  const ownDayCount = takenDays.length
  const canCopyToAnotherDay = ownDayCount < MAX_DAY_VARIANTS
  const selectedCell = selectedDow == null ? null : cells.find((cell) => cell.dayOfWeek === selectedDow) ?? null
  const selectedTargetCalories = selectedCell?.targetCalories ?? null
  // El día base dejó de regir cualquier día (los 7 son propios): sigue viajando en el draft, así
  // que hay que poder abrirlo para corregirlo — el strip solo no lo alcanza.
  const baseOrphan = inheritedDays.length === 0
  // Días que COMPARTEN el día base sin contar el que está en pantalla.
  const sharedWith = inheritedDays.filter((dayOfWeek) => dayOfWeek !== selectedDow)

  function commitRename() {
    if (renamingKey) handlers.onRename(renamingKey, renameDraft.trim() === '' ? 'Día' : renameDraft.trim())
    setRenamingKey(null)
  }

  // Teclado: ←/→ + Inicio/Fin mueven el foco por la fila (mismo patrón que WeekDayNav).
  function handleCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = cells.length - 1
    if (next == null) return
    event.preventDefault()
    const total = cells.length
    cellRefs.current[((next % total) + total) % total]?.focus()
  }

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-7 gap-1"
        role="group"
        aria-label="Días del plan: toca un día para editar lo que recibe"
      >
        {cells.map((cell, index) => {
          const isSelected = cell.dayOfWeek === selectedDow
          const hasError = Boolean(errorByVariantKey?.[cell.variant.id])
          return (
            <button
              key={cell.dayOfWeek}
              type="button"
              ref={(node) => {
                cellRefs.current[index] = node
              }}
              aria-pressed={isSelected}
              aria-label={
                formatNutritionPlanDowCellAccessibilityLabel(cell) + (hasError ? ', tiene algo por resolver' : '')
              }
              onClick={() => handlers.onSelectDay(cell.dayOfWeek)}
              onKeyDown={(event) => handleCellKeyDown(event, index)}
              className={
                'flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (hasError
                  ? 'border-rose-400 bg-rose-50 dark:border-rose-700/70 dark:bg-rose-950/30'
                  : isSelected
                    ? 'border-primary bg-primary/10 dark:border-primary dark:bg-primary/15'
                    : 'border-border-subtle bg-surface-card hover:bg-surface-sunken') +
                // Hoy marcado sutil, esté o no elegido (mismo patrón que la tira de seguimiento).
                (cell.isToday && !isSelected && !hasError ? ' ring-1 ring-primary/40' : '') +
                (isSelected && hasError ? ' ring-1 ring-primary/60' : '')
              }
            >
              <span
                className={
                  'text-[10px] font-bold uppercase leading-none tracking-[0.06em] ' +
                  (isSelected ? 'text-primary' : cell.isToday ? 'text-strong' : 'text-subtle')
                }
              >
                {cell.shortLabel}
              </span>
              <span
                className={
                  'text-[11px] font-semibold leading-none tabular-nums ' +
                  (isSelected ? 'text-primary' : cell.displayCalories == null ? 'text-subtle' : 'text-muted')
                }
              >
                {formatNutritionPlanDowCalories(cell.displayCalories)}
              </span>
              {hasError ? (
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-rose-600 dark:text-rose-300" />
              ) : (
                <span
                  aria-hidden="true"
                  className={
                    'mt-0.5 shrink-0 rounded-full ' +
                    (cell.isOwnDay ? 'h-[6px] w-[6px] bg-primary' : 'h-[5px] w-[5px] border border-border-default')
                  }
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-primary" />
          {NUTRITION_PLAN_DOW_LEGEND.own}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full border border-border-default" />
          {NUTRITION_PLAN_DOW_LEGEND.inherited}
        </span>
      </div>

      {/* Barra de contexto: qué se está editando y a quién le llega. */}
      {inherited ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-border-default bg-surface-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-strong">Estás editando el día base</p>
            <p className="text-xs leading-relaxed text-muted">
              {inheritedDays.length === 0
                ? 'Ningún día lo usa: los siete tienen contenido propio, pero el día base sigue publicándose.'
                : inheritedDays.length === NUTRITION_WEEK_ORDER.length
                  ? 'Se aplica a los siete días de la semana.'
                  : `Se aplica a ${joinShortDays(inheritedDays)} — lo que cambies acá cambia en ${
                      sharedWith.length === 0 ? 'ese día' : `esos ${inheritedDays.length} días`
                    }.`}{' '}
              <span className="tabular-nums">{kcalLabel(selectedKcal, selectedTargetCalories)}</span>
            </p>
          </div>
          {selectedDow != null ? (
            <PersonalizeCta dayOfWeek={selectedDow} locked={personalizeLocked} onPersonalize={handlers.onPersonalize} />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-strong">{ownDayTitle(selectedVariant)}</p>
            <p className="text-xs tabular-nums text-muted">
              {kcalLabel(selectedKcal, selectedTargetCalories)}
              <span className="text-subtle"> · solo este día</span>
              {selectedVariant.targetsMode === 'custom' ? (
                <span className="text-primary"> · objetivos propios</span>
              ) : null}
            </p>
          </div>
          <DayMenu
            variant={selectedVariant}
            takenDays={takenDays}
            canCopyToAnotherDay={canCopyToAnotherDay}
            onRenameRequest={() => {
              setRenameDraft(selectedVariant.label)
              setRenamingKey(selectedVariant.key)
            }}
            handlers={handlers}
          />
        </div>
      )}

      {/* El día base huérfano necesita una puerta: sin esto no hay forma de corregir su contenido
          (ni de ver su error de validación) cuando los 7 días son propios. */}
      {baseOrphan ? (
        <button
          type="button"
          aria-pressed={selectedDow == null}
          onClick={() => handlers.onSelectDay(null)}
          className={
            'flex min-h-11 w-full items-center justify-between gap-2 rounded-control border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
            (selectedDow == null
              ? 'border-primary bg-primary/10'
              : 'border-border-subtle bg-surface-sunken hover:border-primary/40')
          }
        >
          <span className="min-w-0 flex-1 text-xs text-muted">
            El día base ya no rige ningún día, pero sigue publicándose.
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary">Ver</span>
        </button>
      ) : null}

      {/* Coach BASE con un plan que YA tiene días propios (típicamente convertido de V1): el
          servidor rechazará el publish con UPGRADE_REQUIRED. Se avisa acá, no al final. La salida
          primaria es MEJORAR el plan; eliminar los días extra queda en texto plano. */}
      {personalizeLocked && ownDayCount > 0 ? (
        <div
          role="alert"
          className="rounded-control border border-amber-300/70 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-200">
            Publicar este plan con {ownDayCount} {ownDayCount === 1 ? 'día propio' : 'días propios'} requiere Nutrición
            Pro.
          </p>
          <Link
            href={NUTRITION_PRO_UPGRADE_HREF}
            className="mt-2 inline-flex min-h-9 items-center rounded-control bg-primary/100 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Mejorar tu plan
          </Link>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
            Si prefieres seguir con tu plan actual, usa &quot;Eliminar día&quot; en el menú de cada día propio y publica
            uno solo para toda la semana.
          </p>
        </div>
      ) : null}

      {renamingKey ? (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="rename-day">
            Nombre del día
          </label>
          <input
            id="rename-day"
            ref={renameRef}
            className="min-h-9 min-w-40 flex-1 rounded-control border border-border-default bg-surface-card px-2 text-sm text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            value={renameDraft}
            maxLength={120}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setRenamingKey(null)
              }
            }}
          />
          <button type="button" onClick={commitRename} className={ghostButtonClass}>
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Guardar
          </button>
          <button
            type="button"
            aria-label="Cancelar el cambio de nombre"
            onClick={() => setRenamingKey(null)}
            className={ghostButtonClass + ' px-2'}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Editor de metas propias del día en pantalla (se abre desde el menú ⋮). El día base nunca
          lo muestra: sus metas son las del paso "El plan". */}
      {!inherited && selectedVariant.targetsMode === 'custom' ? (
        <div className="rounded-control border border-primary/25 bg-primary/5 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-primary">Objetivos propios de {ownDayTitle(selectedVariant)}</p>
            <button
              type="button"
              onClick={() => handlers.onSetTargetsMode(selectedVariant.key, 'inherit')}
              className="min-h-9 text-xs font-semibold text-primary underline underline-offset-2"
            >
              Volver a los objetivos base
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MACRO_FIELDS.map(({ field, label }) => (
              <div key={field}>
                <label
                  className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-subtle"
                  htmlFor={`variant-target-${selectedVariant.key}-${field}`}
                >
                  {label}
                </label>
                <input
                  id={`variant-target-${selectedVariant.key}-${field}`}
                  className={macroInputClass}
                  inputMode="decimal"
                  placeholder={state.targets[field] || '0'}
                  value={selectedVariant.targets[field]}
                  onChange={(e) => handlers.onSetVariantTarget(selectedVariant.key, field, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
