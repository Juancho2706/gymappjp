'use client'

/**
 * Confirmación de "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5, W1.5).
 *
 * Por qué existe: registrar un ítem del plan es UN tap y no había nada entre el tap y las 4.470
 * kcal del "Huevo revuelto 30 un" del plan de Jean. AVISA y no bloquea (misma regla que Atwater):
 * confirmar corre el flujo de siempre, con el mismo payload y la misma idempotency key — el
 * diálogo no toca la mutación, solo la demora un tap.
 *
 * Superficie: `TodayModal` (el sheet propio del Hoy del alumno, con focus-trap, Escape y
 * scroll-lock) + los dos `NutritionMotionButton` del DS, igual que `VoidEntryDialog`
 * (`TodayExperience.tsx:2292`). El molde de copy es el de `ExitConfirmDialog` del coach.
 */

import { AlertTriangle } from 'lucide-react'
import { NutritionMotionButton } from '@/components/nutrition-v2'
import { TodayModal } from './TodayModal'

export function ImplausibleIntakeDialog({
  title,
  body,
  items,
  confirmLabel = 'Registrar',
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string
  /** Una línea que explica POR QUÉ preguntamos (`prescribedItemImplausibleCopy` o su par bulk). */
  body: string
  /** Nombres de los ítems sospechosos, cuando la confirmación cubre varios (bulk). */
  items?: string[]
  confirmLabel?: string
  pending?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <TodayModal
      title={title}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton pending={pending} onClick={onConfirm}>
            {confirmLabel}
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-5 text-warning-700">{body}</p>
        </div>
        {items && items.length > 0 ? (
          <ul className="space-y-1 text-sm text-body">
            {items.map((name) => (
              <li key={name}>· {name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </TodayModal>
  )
}
