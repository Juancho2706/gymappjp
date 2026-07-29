'use client'

/**
 * Barra de días del builder multi-día (SPEC nutrition-multiday, UX 1).
 *
 * Vive arriba de las franjas del paso "Construcción": un chip por día del plan (etiqueta +
 * kcal del día, el activo resaltado), el botón "Agregar día" y, por chip, el menú ⋯ con
 * Renombrar · Cambiar día · Duplicar como otro día · Personalizar objetivos · Eliminar. El
 * día base no se elimina ni cambia de día (invariantes del reducer, espejadas aquí en la UI).
 *
 * Debajo va el banner de herencia de metas del día activo: "Usa los objetivos base (X kcal) ·
 * Personalizar", que despliega el editor de metas SCOPED a ese día.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, MoreVertical, Pencil, Sliders, Trash2, X } from 'lucide-react'
import { NUTRITION_DAY_LABELS, NUTRITION_WEEK_ORDER, formatNutritionCalories } from '@eva/nutrition-v2'
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

function kcalLabel(value: number): string {
  return formatNutritionCalories(Math.round(value))
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

  function commitRename() {
    if (renamingKey) handlers.onRename(renamingKey, renameDraft.trim() === '' ? 'Día' : renameDraft.trim())
    setRenamingKey(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Días del plan">
        {variants.map((variant) => {
          const isActive = variant.key === active?.key
          const kcal = kcalByVariantKey[variant.key] ?? 0
          return (
            <div
              key={variant.key}
              className={
                'flex items-center gap-0.5 rounded-pill border pl-3 pr-0.5 transition-colors ' +
                (isActive
                  ? 'border-primary bg-primary/10'
                  : 'border-border-default bg-surface-card hover:border-primary/40')
              }
            >
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => handlers.onSelect(variant.key)}
                className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={isActive ? 'text-primary' : 'text-strong'}>{variant.label}</span>
                <span className="font-mono tabular-nums text-[11px] font-normal text-muted">{kcalLabel(kcal)}</span>
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

      {/* Coach BASE con un plan que YA tiene varios días (típicamente convertido de V1): el
          servidor rechazará el publish con UPGRADE_REQUIRED. Se avisa acá, no al final. */}
      {addDayLocked && variants.length > 1 ? (
        <p
          role="alert"
          className="rounded-control border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          Este plan tiene {variants.length} días distintos y publicarlos requiere Nutrición Pro. Puedes eliminar los
          días extra desde su menú, o{' '}
          <Link href={NUTRITION_PRO_UPGRADE_HREF} className="font-semibold underline underline-offset-2">
            mejorar tu plan
          </Link>
          .
        </p>
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
