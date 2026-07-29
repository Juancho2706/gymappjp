'use client'

/**
 * Barra de días del builder multi-día (SPEC nutrition-multiday, UX 1).
 *
 * Vive arriba de las franjas del paso "Construcción": un chip por día del plan (etiqueta +
 * "kcal / meta" del día, el activo resaltado), el botón "Agregar día" y, por chip, el menú ⋯
 * con Renombrar · Cambiar día · Duplicar como otro día · Personalizar objetivos · Eliminar.
 * El día base no se elimina ni cambia de día (invariantes del reducer, espejadas acá).
 *
 * La barra EXPLICA la semana, no solo la lista de días (auditoría P0-2/P1-3):
 *  - los chips van en el orden canónico Lu→Do (`sortNutritionDayVariantsForDisplay`, el MISMO
 *    helper que la ficha, la edición rápida y el alumno);
 *  - debajo va la tira Lu-Do del día activo (`DayVariantWeekStrip`, el mismo componente del
 *    paso Revisar y de la ficha): el coach ve qué días cubre lo que está editando sin llegar
 *    al final del asistente;
 *  - el día base queda marcado "Sin días" cuando los siete días tienen su propia variante
 *    (P2-3: editarlo no le llega a nadie);
 *  - un día con errores de validación se pinta en tono destructivo (P2-1) y el mensaje de
 *    error del paso enlaza a él.
 *
 * Debajo va el banner de herencia de metas del día activo: "Usa los objetivos base (X kcal) ·
 * Personalizar", que despliega el editor de metas SCOPED a ese día.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, MoreVertical, Pencil, Sliders, Trash2, X } from 'lucide-react'
import {
  NUTRITION_DAY_LABELS,
  NUTRITION_WEEK_ORDER,
  formatNutritionCalories,
  sortNutritionDayVariantsForDisplay,
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
// Import por ruta directa (no via el barrel index.ts): mismo criterio que PlanBuilderClient
// con MacroChipRow — desacopla del orden de edición de otros módulos del kit.
import { DayVariantWeekStrip } from '@/components/nutrition-v2/DayVariantWeekStrip'
import type { BuilderTargets, BuilderVariant } from '../_lib/draft-builder'
import { AddDayPopover, type AddDayOrigin } from './AddDayPopover'

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

export interface DayVariantBarHandlers {
  onSelect: (variantKey: string) => void
  onAddDays: (days: number[], origin: AddDayOrigin) => void
  onRename: (variantKey: string, label: string) => void
  onChangeDay: (variantKey: string, dayOfWeek: number) => void
  onDuplicate: (sourceVariantKey: string, dayOfWeek: number) => void
  onSetTargetsMode: (variantKey: string, mode: 'inherit' | 'custom') => void
  onSetVariantTarget: (variantKey: string, field: keyof BuilderTargets, value: string) => void
  onRemove: (variantKey: string) => void
}

/** Formato es-CL sin unidad, para el par "prescrito / meta" del chip. */
const KCAL_FORMAT = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

/**
 * Metas EFECTIVAS de un día en la barra: las propias solo si el coach las personalizó; el día
 * base siempre usa las del paso "Objetivos". Espejo de `variantEffectiveTargets` del reducer
 * (que necesita el estado completo, acá solo llegan las metas base).
 */
function effectiveTargetsOf(variant: BuilderVariant, baseTargets: BuilderTargets): BuilderTargets {
  return !variant.isDefault && variant.targetsMode === 'custom' ? variant.targets : baseTargets
}

/**
 * Texto de energía del chip (P2-4): "1.850 / 2.000 kcal" cuando el día tiene meta de calorías
 * —así el número dice algo— y solo "1.850 kcal" cuando no hay contra qué compararlo.
 */
function kcalLabel(value: number, targetCalories: string): string {
  const prescribed = Math.round(value)
  const raw = targetCalories.trim()
  const target = Number(raw)
  if (raw === '' || !Number.isFinite(target) || target <= 0) return formatNutritionCalories(prescribed)
  return KCAL_FORMAT.format(prescribed) + ' / ' + formatNutritionCalories(Math.round(target))
}

/** Menú ⋯ de un día. El día base solo ofrece Renombrar (no se elimina ni cambia de día). */
function DayMenu({
  variant,
  takenDays,
  canAddMore,
  onRenameRequest,
  handlers,
}: {
  variant: BuilderVariant
  takenDays: readonly number[]
  canAddMore: boolean
  onRenameRequest: () => void
  handlers: DayVariantBarHandlers
}) {
  const taken = new Set(takenDays)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Opciones del día ${variant.label}`}
        className="h-9 w-9 shrink-0 rounded-control border-0 bg-transparent p-0 normal-case tracking-normal text-muted hover:bg-surface-sunken hover:text-strong dark:bg-transparent"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onRenameRequest}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Renombrar
        </DropdownMenuItem>

        {!variant.isDefault ? (
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
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canAddMore}>Duplicar como otro día</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {NUTRITION_WEEK_ORDER.map((day) => (
              <DropdownMenuItem
                key={day}
                disabled={taken.has(day)}
                onClick={() => handlers.onDuplicate(variant.key, day)}
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
                {NUTRITION_DAY_LABELS[day]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {!variant.isDefault ? (
          <DropdownMenuItem
            onClick={() =>
              handlers.onSetTargetsMode(variant.key, variant.targetsMode === 'custom' ? 'inherit' : 'custom')
            }
          >
            <Sliders aria-hidden="true" className="h-4 w-4" />
            {variant.targetsMode === 'custom' ? 'Volver a los objetivos base' : 'Personalizar objetivos'}
          </DropdownMenuItem>
        ) : null}

        {!variant.isDefault ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => handlers.onRemove(variant.key)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Eliminar día
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DayVariantBar({
  variants,
  activeVariantKey,
  kcalByVariantKey,
  baseTargets,
  addDayLocked,
  errorByVariantKey,
  handlers,
}: {
  variants: BuilderVariant[]
  activeVariantKey: string
  /** kcal del día (items + porciones) por `variant.key`, para el chip. */
  kcalByVariantKey: Record<string, number>
  /** Metas del día base (paso "Objetivos"), para el banner de herencia. */
  baseTargets: BuilderTargets
  /** Coach sin Nutrición Pro: "Agregar día" con candado + upsell. */
  addDayLocked: boolean
  /** Días con algún error de validación (P2-1): el chip se marca en tono destructivo. */
  errorByVariantKey?: Record<string, string>
  handlers: DayVariantBarHandlers
}) {
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingKey) renameRef.current?.focus()
  }, [renamingKey])

  const active = variants.find((variant) => variant.key === activeVariantKey) ?? variants[0]
  const takenDays = variants
    .filter((variant) => !variant.isDefault && variant.dayOfWeek != null)
    .map((variant) => variant.dayOfWeek as number)
  const baseVariant = variants.find((variant) => variant.isDefault) ?? variants[0]
  const canAddMore = takenDays.length < NUTRITION_WEEK_ORDER.length
  // P1-3: mismo orden de lectura que la ficha, la edición rápida y el alumno (base + Lu→Do).
  // El estado conserva el orden de alta; acá solo se presenta.
  const orderedVariants = useMemo(() => sortNutritionDayVariantsForDisplay(variants), [variants])
  // P2-3: los siete días tienen su propia variante ⇒ el día base ya no le aplica a nadie.
  const baseUnused = !canAddMore
  const activeIsUnusedBase = active != null && active.isDefault && baseUnused

  function commitRename() {
    if (renamingKey) handlers.onRename(renamingKey, renameDraft.trim() === '' ? 'Día' : renameDraft.trim())
    setRenamingKey(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Días del plan">
        {orderedVariants.map((variant) => {
          const isActive = variant.key === active?.key
          const kcal = kcalByVariantKey[variant.key] ?? 0
          const kcalText = kcalLabel(kcal, effectiveTargetsOf(variant, baseTargets).calories)
          const hasError = Boolean(errorByVariantKey?.[variant.key])
          const isUnusedBase = variant.isDefault && baseUnused
          return (
            <div
              key={variant.key}
              className={
                'flex items-center gap-0.5 rounded-pill border pl-3 pr-0.5 transition-colors ' +
                (hasError
                  ? 'border-rose-400 bg-rose-50 dark:border-rose-700/70 dark:bg-rose-950/30'
                  : isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border-default bg-surface-card hover:border-primary/40') +
                (isActive && hasError ? ' ring-1 ring-primary/60' : '')
              }
            >
              <button
                type="button"
                aria-pressed={isActive}
                aria-label={
                  variant.label +
                  ' · ' +
                  kcalText +
                  (isUnusedBase ? ' · no se aplica a ningún día' : '') +
                  (hasError ? ' · tiene algo por resolver' : '')
                }
                onClick={() => handlers.onSelect(variant.key)}
                className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {hasError ? (
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-300" />
                ) : null}
                <span className={isActive && !hasError ? 'text-primary' : 'text-strong'}>{variant.label}</span>
                {isUnusedBase ? (
                  <span
                    title="No se aplica a ningún día"
                    className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 text-[10px] font-medium text-subtle"
                  >
                    Sin días
                  </span>
                ) : null}
                <span className="font-mono tabular-nums text-[11px] font-normal text-muted">{kcalText}</span>
              </button>
              <DayMenu
                variant={variant}
                takenDays={takenDays}
                canAddMore={canAddMore}
                onRenameRequest={() => {
                  setRenameDraft(variant.label)
                  setRenamingKey(variant.key)
                }}
                handlers={handlers}
              />
            </div>
          )
        })}

        <AddDayPopover
          takenDays={takenDays}
          canCopyBase={baseVariant != null && baseVariant.slots.length > 0}
          locked={addDayLocked}
          onCreate={handlers.onAddDays}
        />
      </div>

      {/* P0-2: la tira Lu-Do del día ACTIVO, el mismo componente del paso Revisar y de la ficha.
          Acá el coach está decidiendo, así que ve la cobertura semanal mientras arma. */}
      {active != null ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 [&>ul]:mt-0">
          <p className="text-[11px] leading-5 text-muted">
            {activeIsUnusedBase ? 'No se aplica a ningún día:' : 'Se aplica en:'}
          </p>
          <DayVariantWeekStrip variants={variants} variant={active} />
        </div>
      ) : null}

      {/* Coach BASE con un plan que YA tiene varios días (típicamente convertido de V1): el
          servidor rechazará el publish con UPGRADE_REQUIRED. Se avisa acá, no al final.
          P1-7: la salida primaria es MEJORAR el plan; borrar los días extra queda como
          alternativa en texto plano — el caso típico es un plan que el alumno ya usa. */}
      {addDayLocked && variants.length > 1 ? (
        <div
          role="alert"
          className="rounded-control border border-amber-300/70 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-200">
            Publicar los {variants.length} días de este plan requiere Nutrición Pro.
          </p>
          <Link
            href={NUTRITION_PRO_UPGRADE_HREF}
            className="mt-2 inline-flex min-h-9 items-center rounded-control bg-primary/100 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Mejorar tu plan
          </Link>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
            Si prefieres seguir con tu plan actual, elimina los días extra desde el menú ⋯ de cada día y publica uno
            solo para toda la semana.
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

      {/* Banner de herencia de metas del día ACTIVO. El día base nunca lo muestra: sus metas
          son las del paso "Objetivos". */}
      {active != null && !active.isDefault ? (
        active.targetsMode === 'custom' ? (
          <div className="rounded-control border border-primary/25 bg-primary/5 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-primary">Objetivos propios de {active.label}</p>
              <button
                type="button"
                onClick={() => handlers.onSetTargetsMode(active.key, 'inherit')}
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
                    htmlFor={`variant-target-${active.key}-${field}`}
                  >
                    {label}
                  </label>
                  <input
                    id={`variant-target-${active.key}-${field}`}
                    className={macroInputClass}
                    inputMode="decimal"
                    placeholder={baseTargets[field] || '0'}
                    value={active.targets[field]}
                    onChange={(e) => handlers.onSetVariantTarget(active.key, field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2">
            <p className="min-w-0 flex-1 text-xs text-muted">
              {active.label} usa los objetivos base
              {baseTargets.calories.trim() !== '' ? ` (${baseTargets.calories} kcal)` : ''}.
            </p>
            <button
              type="button"
              onClick={() => handlers.onSetTargetsMode(active.key, 'custom')}
              className="min-h-9 shrink-0 text-xs font-semibold text-primary underline underline-offset-2"
            >
              Personalizar
            </button>
          </div>
        )
      ) : null}
    </div>
  )
}
