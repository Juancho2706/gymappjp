'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  NUTRITION_WEB_TONE_CLASSES,
  formatNutritionCalories,
  type CoachDayIntakeRow,
  type NutritionIntakeReadItem,
} from '@eva/nutrition-v2'
import { FoodRow } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'

/**
 * Registros de HOY del alumno dentro de la card «Hoy» de la ficha del coach (tren «Cantidades
 * honestas», W4.1, mockup M4). Mismas filas que ve el alumno en la web (`FoodRow` del kit) y dos
 * acciones por fila: **Retirar** (con confirmación inline, nada de `window.confirm`) y **Editar
 * cantidad** (input numérico inline; la unidad no se toca). Presentacional: el padre trae las
 * filas ya armadas (`buildCoachDayIntakeRows`) y ejecuta las acciones server.
 *
 * Solo hoy (SPEC §5.7 R3). Con 0 registros no pinta nada: la card ya dice «0 registros».
 */
const INITIAL_VISIBLE = 5

export function DayIntakeEntries({
  rows,
  ratioChipLabel,
  pendingEntryId,
  error,
  onVoid,
  onEditQuantity,
}: {
  rows: CoachDayIntakeRow[]
  /** «4× la meta» (`consumedRatioChipLabel`); `null` = sin chip. */
  ratioChipLabel: string | null
  /** Registro con una acción en vuelo: sus botones se deshabilitan. */
  pendingEntryId: string | null
  error?: string | null
  onVoid: (entry: NutritionIntakeReadItem) => void
  onEditQuantity: (entry: NutritionIntakeReadItem, quantity: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)

  if (rows.length === 0) return null
  const visible = showAll ? rows : rows.slice(0, INITIAL_VISIBLE)
  const hidden = rows.length - visible.length

  const submitEdit = (entry: NutritionIntakeReadItem) => {
    if (!editing) return
    const quantity = Number(editing.value.replace(',', '.'))
    if (!Number.isFinite(quantity) || quantity <= 0) return
    onEditQuantity(entry, quantity)
    setEditing(null)
  }

  return (
    <div className="mt-3 border-t border-border-subtle pt-1" data-testid="coach-day-intake-entries">
      {ratioChipLabel ? (
        <div className="flex justify-end pt-2">
          <span
            className={cn(
              'inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold tabular-nums',
              NUTRITION_WEB_TONE_CLASSES.warning,
            )}
            title="Consumido de hoy sobre la meta del día"
          >
            {ratioChipLabel}
          </span>
        </div>
      ) : null}
      <ul className="divide-y divide-border-subtle">
        {visible.map(({ entry, row, slotName, clock, priorVersion }) => {
          const isPending = pendingEntryId === entry.id
          const isConfirming = confirmingId === entry.id
          const isEditing = editing?.id === entry.id
          const detail = [slotName ?? 'Fuera del plan', clock].filter(Boolean).join(' · ')
          return (
            <li key={entry.id} className={cn(isPending && 'opacity-60')}>
              <FoodRow
                food={{ ...row, detail }}
                actions={
                  !isConfirming && !isEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Editar cantidad de ${row.name}`}
                        disabled={isPending}
                        onClick={() => {
                          setConfirmingId(null)
                          setEditing({ id: entry.id, value: String(entry.quantity) })
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setEditing(null)
                          setConfirmingId(entry.id)
                        }}
                        className="inline-flex min-h-10 items-center gap-1 rounded-control px-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        Retirar
                      </button>
                    </div>
                  ) : null
                }
              />
              {priorVersion ? (
                <div className="-mt-1 pb-3 pl-[3.25rem]">
                  <span className="inline-flex items-center rounded-pill border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
                    De una versión anterior del plan
                  </span>
                </div>
              ) : null}
              {isConfirming ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2 text-xs">
                  <span className="text-body">¿Retirar este registro del día del alumno?</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="inline-flex min-h-9 items-center rounded-control border border-border-default bg-surface-card px-3 font-semibold text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setConfirmingId(null)
                        onVoid(entry)
                      }}
                      className="inline-flex min-h-9 items-center rounded-control bg-rose-600 px-3 font-semibold text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      Retirar
                    </button>
                  </span>
                </div>
              ) : null}
              {isEditing ? (
                <form
                  className="flex flex-wrap items-center gap-2 rounded-control bg-surface-sunken px-3 py-2 text-xs"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitEdit(entry)
                  }}
                >
                  <label className="flex items-center gap-2 text-body">
                    Cantidad
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={editing.value}
                      onChange={(event) => setEditing({ id: entry.id, value: event.target.value })}
                      className="h-9 w-24 rounded-control border border-border-default bg-surface-card px-2 text-sm font-semibold tabular-nums text-strong outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                      autoFocus
                    />
                    <span className="text-muted">{entry.unit}</span>
                  </label>
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="inline-flex min-h-9 items-center rounded-control border border-border-default bg-surface-card px-3 font-semibold text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex min-h-9 items-center rounded-control bg-primary/100 px-3 font-semibold text-white hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      Guardar
                    </button>
                  </span>
                </form>
              ) : null}
            </li>
          )
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 inline-flex min-h-9 items-center rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {`y ${hidden} más · Ver todos`}
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-subtle">
        Total de hoy: {formatNutritionCalories(rows.reduce((sum, item) => sum + (item.row.calories ?? 0), 0))}
      </p>
    </div>
  )
}
