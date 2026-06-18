import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Claridad layer (§5b): tiny badge that tells the coach, at a glance, whether a
 * nutrition surface is included in the base tier (canUseNutrition) or belongs to
 * the paid "Nutrición Pro" add-on (intercambios). Color is never the sole signal —
 * the literal text "Base" / "Pro" carries the meaning.
 */
export type NutritionTier = 'base' | 'pro'

export function TierBadge({ tier, className }: { tier: NutritionTier; className?: string }) {
  if (tier === 'pro') {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400',
          className
        )}
      >
        Pro
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        className
      )}
    >
      Base
    </Badge>
  )
}
