'use client'

import posthog from 'posthog-js'
import { featureFlags } from '@/lib/feature-flags'

type NutritionTrackProps = Record<string, string | number | boolean | null | undefined>

/**
 * Custom events for nutrition.
 *
 * Iban a Vercel Web Analytics vía `track()`, pero Web Analytics NUNCA estuvo habilitado en el
 * proyecto: `/_vercel/insights/script.js` responde 404 (visible en consola de producción) y la
 * API contesta `Web Analytics not found`. O sea, TODOS estos eventos se perdían en silencio
 * desde que se instrumentaron. PostHog ya está montado, con consentimiento y con proxy propio
 * (`/ph`), así que los eventos van ahí.
 *
 * Consentimiento: `posthog.init` corre con `opt_out_capturing_by_default: true` y el banner de
 * cookies hace el opt-in (Ley 21.719). `capture()` es no-op mientras el usuario no acepte, así
 * que este helper no puede filtrar nada sin permiso.
 *
 * Props: solo primitivos — sin UUIDs (privacidad / PMM / Legal mínimo viable).
 */
export function trackNutritionEvent(name: NutritionAnalyticsEvent, props?: NutritionTrackProps): void {
  if (typeof window === 'undefined') return
  if (!featureFlags.nutritionAnalytics) return
  const flat: Record<string, string | number | boolean | null> = {}
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue
      flat[k] = v
    }
  }
  posthog.capture(name, flat)
}

export type NutritionAnalyticsEvent =
  | 'nutrition_meal_toggled'
  | 'nutrition_meal_toggle_queued'
  | 'nutrition_plan_export_copied'
  | 'nutrition_plan_pdf_downloaded'
  // Módulo nutrition_exchanges — métrica mínima de PDF (regla director §3)
  | 'nutrition_exchange_pdf_ok'
  | 'nutrition_exchange_pdf_error'
