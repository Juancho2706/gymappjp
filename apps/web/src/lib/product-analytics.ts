import { track } from '@vercel/analytics'
import { featureFlags } from '@/lib/feature-flags'

type NutritionTrackProps = Record<string, string | number | boolean | null | undefined>

/**
 * Custom events for nutrition (Vercel Web Analytics).
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
  track(name, flat)
}

export type NutritionAnalyticsEvent =
  | 'nutrition_meal_toggled'
  | 'nutrition_meal_toggle_queued'
  | 'nutrition_plan_export_copied'
  | 'nutrition_plan_pdf_downloaded'
