'use client'

/**
 * Fila del picker de alimentos: miniatura + nombre + marca/envase + MACROS COMPLETAS.
 *
 * REGLA DURA (owner 2026-08-05): todo alimento individual muestra SIEMPRE kcal · P · C · G,
 * aunque sea en tipografía mínima. Por eso `MacroSparkPopover` (T3.v Cabina) va en TODAS las
 * filas —sugerencias y resultados—: la barra resume por aporte calórico y el popover trae los
 * gramos exactos a un hover/tap, así que nunca se recorta a "kcal solamente" por falta de ancho.
 *
 * Estados de la fila:
 *  - normal: `+` agrega (en multi-add no cierra; la fila pasa a ✓ y permite repetir),
 *  - favorito del alumno: estrellita,
 *  - intolerancia / disgusto: badge ámbar, agrega igual,
 *  - alergia: fila BLOQUEADA con "Usar igual" (override explícito con confirmación inline).
 */

import { useState } from 'react'
import { AlertTriangle, BadgeCheck, Check, Plus, ShieldCheck, Star } from 'lucide-react'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { MacroSparkPopover } from '@/components/nutrition-v2/MacroSparkPopover'
import type { FoodVerificationTone } from '@/lib/food-detail'
import { FoodThumb } from '../FoodImage'
import { foodCatalogItemToCardModel } from '../../_lib/food-catalog-card'
import { canAddFoodPickerItem, type FoodPickerRestrictionState } from './food-picker-grouping'

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

const VERIFICATION_TONE_CLASSES: Record<FoodVerificationTone, string> = {
  verified:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  community:
    'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
  neutral: 'border-border-subtle bg-surface-sunken text-muted',
  danger:
    'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
}

export interface FoodPickerRowProps {
  item: FoodCatalogItem
  /** id del `role="option"` (navegación por teclado del combobox). */
  optionId: string
  active: boolean
  /** Cuántas veces se agregó en esta sesión del picker (multi-add). */
  addedCount: number
  favorite: boolean
  restriction: FoodPickerRestrictionState
  overridden: boolean
  /** Veces que el coach prescribió este alimento (solo en "Frecuentes tuyos"). */
  usageCount?: number | null
  onPick: () => void
  onOverride: () => void
  onActivate: () => void
}

export function FoodPickerRow({
  item,
  optionId,
  active,
  addedCount,
  favorite,
  restriction,
  overridden,
  usageCount,
  onPick,
  onOverride,
  onActivate,
}: FoodPickerRowProps) {
  const [confirming, setConfirming] = useState(false)
  const model = foodCatalogItemToCardModel(item, SUPABASE_BASE)
  const addable = canAddFoodPickerItem(restriction, overridden)
  const meta = [model.brand, model.packageLabel].filter(Boolean).join(' · ')
  const added = addedCount > 0

  return (
    <li
      id={optionId}
      role="option"
      aria-selected={active}
      aria-disabled={!addable}
      onMouseEnter={onActivate}
      className={
        'rounded-control border transition-colors ' +
        (active ? 'border-primary bg-primary/5' : 'border-border-subtle bg-surface-card') +
        (restriction.tone === 'danger' ? ' border-rose-300 dark:border-rose-800' : '')
      }
    >
      <div className="flex items-center gap-2.5 p-2">
        <FoodThumb imageUrl={model.thumbnailUrl} iconUrl={model.categoryIconUrl} alt={item.name} />

        {/*
          El trigger del popover de macros renderiza su propio <button> (Base UI): no puede
          anidarse dentro del botón "Agregar" (HTML inválido + el click de la barra dispararía
          también el alta). Por eso el nombre/meta y el spark son DOS elementos hermanos —mismo
          patrón que el mockup Cabina v2 (`.p-row`: foto · nombre · spark · +)— en vez del botón
          único de antes.
        */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={!addable}
            onClick={onPick}
            aria-label={`${added ? 'Agregar otra vez' : 'Agregar'} ${item.name}${item.brand ? ` (${item.brand})` : ''}`}
            className="block w-full rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold text-strong">{item.name}</span>
              {favorite ? (
                <Star
                  aria-label="Favorito del alumno"
                  className="size-3.5 shrink-0 fill-amber-400 text-amber-500"
                />
              ) : null}
            </span>
            {meta ? <span className="mt-0.5 block truncate text-[11px] text-muted">{meta}</span> : null}
          </button>
          {/* Macros COMPLETAS siempre (regla dura): kcal · P · C · G, ahora vía MacroSpark + su
              popover de gramos (T3.v Cabina). `basisLabel` viaja dinámico (NUT-001: filas
              `per_serving` NO son "por 100 g"). */}
          <div className="mt-1">
            <MacroSparkPopover
              size="sm"
              calories={item.calories}
              proteinG={item.proteinG}
              carbsG={item.carbsG}
              fatsG={item.fatsG}
              basisLabel={model.basisLabel}
              ariaContext={item.name}
            />
          </div>
        </div>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {addable ? (
            <button
              type="button"
              onClick={onPick}
              aria-label={`${added ? 'Agregar otra vez' : 'Agregar'} ${item.name}`}
              className={
                'inline-flex size-9 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (added
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-border-default bg-surface-card text-strong hover:bg-surface-sunken')
              }
            >
              {added ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            </button>
          ) : null}
          {addedCount > 1 ? (
            <span className="text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              ×{addedCount}
            </span>
          ) : null}
        </span>
      </div>

      {/* Pills de contexto: verificación, uso frecuente y aviso de restricción. */}
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
        <span
          className={
            'inline-flex h-5 items-center gap-1 rounded-pill border px-1.5 text-[10px] font-bold ' +
            VERIFICATION_TONE_CLASSES[model.verificationTone]
          }
        >
          {model.verificationTone === 'verified' ? (
            <BadgeCheck aria-hidden="true" className="size-3" />
          ) : item.verificationStatus === 'coach_verified' ? (
            <ShieldCheck aria-hidden="true" className="size-3" />
          ) : null}
          {model.verificationLabel}
        </span>
        {usageCount != null && usageCount > 0 ? (
          <span className="inline-flex h-5 items-center rounded-pill border border-border-subtle bg-surface-sunken px-1.5 text-[10px] font-semibold text-muted">
            Lo usas {usageCount}×
          </span>
        ) : null}
        {restriction.label ? (
          <span
            className={
              'inline-flex h-5 items-center gap-1 rounded-pill border px-1.5 text-[10px] font-bold ' +
              (restriction.tone === 'danger'
                ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300')
            }
          >
            <AlertTriangle aria-hidden="true" className="size-3" />
            {restriction.label}
          </span>
        ) : null}
        {overridden ? (
          <span className="text-[10px] font-semibold text-muted">Prescrito con tu confirmación</span>
        ) : null}
      </div>

      {/* Alergia: la fila no se agrega sola. Override EXPLÍCITO en dos toques. */}
      {restriction.blocked && !overridden ? (
        <div className="border-t border-rose-200 px-2 py-1.5 dark:border-rose-900">
          {confirming ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                ¿Prescribir un alimento con alergia declarada?
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="inline-flex min-h-8 items-center rounded-control border border-border-default bg-surface-card px-2.5 text-[11px] font-semibold text-strong hover:bg-surface-sunken"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false)
                    onOverride()
                  }}
                  className="inline-flex min-h-8 items-center rounded-control bg-rose-600 px-2.5 text-[11px] font-semibold text-white hover:bg-rose-700"
                >
                  Sí, usar igual
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-8 items-center rounded-control border border-rose-300 bg-surface-card px-2.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              Usar igual
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}
