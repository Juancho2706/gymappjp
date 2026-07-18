'use client'

import { useEffect, useState } from 'react'
import { History, X } from 'lucide-react'

const DISMISS_KEY_PREFIX = 'eva:nutrition-v2-converted-plan-banner-dismissed:'

/**
 * Aviso discreto en la ficha V2 del coach: el plan vigente del alumno viene de la conversion
 * automatica V1->V2 (ver specs/nutrition-v2-conversion/SPEC.md AC8). Fase 1 es solo informativo
 * (sin boton "regenerar", el re-sync todavia es por CLI) — nada bloqueante.
 *
 * Descartable client-side, persistido en localStorage por `planId` (mismo patron que
 * `NutritionV2Banner` en `apps/web/src/app/c/[coach_slug]/nutrition/_components/`). Progressive
 * enhancement: arranca oculto y se resuelve en el efecto para no parpadear un aviso ya
 * descartado en SSR. Tokens del DS (`border-border-subtle`, `bg-surface-sunken`, `text-body`),
 * theme-aware sin colores crudos — mismo tratamiento visual que el aviso de "hoy" de esta ficha.
 */
export function ConvertedPlanBanner({
  planId,
  convertedAtLabel,
}: {
  planId: string
  convertedAtLabel: string
}) {
  const dismissKey = `${DISMISS_KEY_PREFIX}${planId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(dismissKey) !== '1') setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [dismissKey])

  if (!visible) return null

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(dismissKey, '1')
    } catch {
      /* almacenamiento no disponible: descarte solo en memoria */
    }
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3 text-sm text-body"
    >
      <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <p className="flex-1">
        Plan convertido del sistema anterior el{' '}
        <span className="font-semibold text-strong">{convertedAtLabel}</span> — revísalo cuando
        quieras.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descartar aviso"
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-card hover:text-strong"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
