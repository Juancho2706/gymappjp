'use client'

import { useState, useTransition } from 'react'
import type { CoachDayIntakeRow, NutritionIntakeReadItem } from '@eva/nutrition-v2'
import { DayIntakeEntries } from './DayIntakeEntries'
import {
  correctIntakeQuantityAsCoach,
  voidIntakeAsCoach,
} from '@/app/coach/nutrition-v2/_actions/coach-intake.actions'

/**
 * Puente entre la card «Hoy» (server component) y el panel de registros (presentacional, del kit):
 * estado de la fila en vuelo, el último error y el disparo de las server actions.
 *
 * No pinta nada propio a propósito — todo el visual vive en `DayIntakeEntries`. Las filas llegan ya
 * armadas desde el servidor (`buildCoachDayIntakeRows` + miniatura resuelta), así que este
 * componente no recalcula ni un rótulo: al terminar la acción, `revalidatePath` re-renderiza la
 * ficha con el día recalculado (consumido, `entryCount` y el chip «N× la meta» salen del read
 * model, no de estado local).
 */
export function TodayIntakePanel({
  rows,
  ratioChipLabel,
  clientId,
}: {
  rows: CoachDayIntakeRow[]
  ratioChipLabel: string | null
  clientId: string
}) {
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const run = (entry: NutritionIntakeReadItem, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    setPendingEntryId(entry.id)
    startTransition(async () => {
      const result = await action()
      setPendingEntryId(null)
      if (!result.ok) setError(result.error ?? 'No se pudo actualizar el registro.')
    })
  }

  return (
    <DayIntakeEntries
      rows={rows}
      ratioChipLabel={ratioChipLabel}
      pendingEntryId={pendingEntryId}
      error={error}
      onVoid={(entry) => run(entry, () => voidIntakeAsCoach({ clientId, entryId: entry.id }))}
      onEditQuantity={(entry, quantity) =>
        run(entry, () => correctIntakeQuantityAsCoach({ clientId, entryId: entry.id, quantity }))
      }
    />
  )
}
