'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  NUTRITION_MEAL_SLOTS,
  NUTRITION_MEAL_SLOT_LABELS,
  calculateIntakeEntryMacros,
  calculateIntakeEntriesTotals,
  normalizeNutritionMealSlot,
  type NutritionMealSlot,
} from '@eva/nutrition-engine'
import type { IntakeEntryWithFood } from '@/services/nutrition-intake.service'
import { deleteIntakeEntryAction } from '../_actions/intake.actions'

interface Props {
  entries: IntakeEntryWithFood[]
  coachSlug: string
  addHref: string
}

function entryName(entry: IntakeEntryWithFood): string {
  return entry.snapshot_name
    || entry.food?.name
    || entry.custom_name
    || 'Alimento'
}

function entryBrand(entry: IntakeEntryWithFood): string | null {
  return entry.snapshot_brand || entry.food?.brand || null
}

export function NutritionIntakeLedger({ entries: initialEntries, coachSlug, addHref }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const totals = useMemo(() => calculateIntakeEntriesTotals(entries), [entries])
  const groups = useMemo(() => {
    const map = new Map<NutritionMealSlot, IntakeEntryWithFood[]>()
    for (const slot of NUTRITION_MEAL_SLOTS) map.set(slot, [])
    for (const entry of entries) {
      const slot = normalizeNutritionMealSlot(entry.meal_slot)
      map.get(slot)!.push(entry)
    }
    return NUTRITION_MEAL_SLOTS
      .map((slot) => ({ slot, entries: map.get(slot) ?? [] }))
      .filter((group) => group.entries.length > 0)
  }, [entries])

  function removeEntry(entry: IntakeEntryWithFood) {
    if (pending) return
    const previous = entries
    setEntries((current) => current.filter((row) => row.id !== entry.id))
    setDeletingId(entry.id)

    startTransition(async () => {
      const result = await deleteIntakeEntryAction({ coachSlug, entryId: entry.id })
      setDeletingId(null)
      if (!result.success) {
        setEntries(previous)
        toast.error(result.error ?? 'No se pudo eliminar el registro.')
        return
      }
      toast.success('Registro eliminado')
      router.refresh()
    })
  }

  return (
    <details open={entries.length > 0} className="group rounded-card border border-border bg-card shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-extrabold tracking-tight text-foreground">Consumo real</h2>
            <span className="rounded-full bg-ember-100 px-2 py-0.5 font-mono text-[10px] font-black tabular-nums text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
              {entries.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {Math.round(totals.calories)} kcal · P {Math.round(totals.protein)}g · C {Math.round(totals.carbs)}g · G {Math.round(totals.fats)}g
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/70 px-4 pb-4 pt-3">
        {groups.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-muted/20 px-4 py-7 text-center">
            <p className="text-sm font-bold text-foreground">Todavía no registraste alimentos</p>
            <p className="mt-1 text-xs text-muted-foreground">Agrega lo que realmente consumiste además de marcar tu plan.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.slot} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                    {NUTRITION_MEAL_SLOT_LABELS[group.slot]}
                  </h3>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                    {Math.round(calculateIntakeEntriesTotals(group.entries).calories)} kcal
                  </span>
                </div>

                <div className="overflow-hidden rounded-control border border-border/70">
                  {group.entries.map((entry, index) => {
                    const macros = calculateIntakeEntryMacros(entry)
                    return (
                      <div
                        key={entry.id}
                        className={`flex min-h-16 items-center gap-3 bg-background/50 px-3 py-2.5 ${index > 0 ? 'border-t border-border/70' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-foreground">{entryName(entry)}</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">
                            {entryBrand(entry) ? `${entryBrand(entry)} · ` : ''}{entry.quantity} {entry.unit}
                          </p>
                          <p className="mt-1 font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                            {Math.round(macros.calories)} kcal · P {Math.round(macros.protein)}g · C {Math.round(macros.carbs)}g · G {Math.round(macros.fats)}g
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry)}
                          disabled={pending && deletingId === entry.id}
                          aria-label={`Eliminar ${entryName(entry)}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-[var(--danger-100)] hover:text-[var(--danger-600)] disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <Link
          href={addHref}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-control border border-dashed border-ember-400 bg-ember-500/[0.06] text-sm font-extrabold text-ember-700 transition-colors hover:bg-ember-500/[0.1] dark:text-ember-300"
        >
          <Plus className="h-4 w-4" />
          Registrar otro alimento
        </Link>
      </div>
    </details>
  )
}
