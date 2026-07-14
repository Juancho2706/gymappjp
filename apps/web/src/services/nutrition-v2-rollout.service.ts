import 'server-only'

import {
  DEFAULT_NUTRITION_V2_ROLLOUT,
  resolveNutritionV2Rollout,
  type NutritionV2RolloutConfig,
  type NutritionV2RolloutContext,
  type NutritionV2RolloutDecision,
} from '@eva/nutrition-v2'

const EDGE_CONFIG_KEY = 'NUTRITION_V2_ROLLOUT'

/**
 * Rollout is intentionally separate from commercial feature preferences.
 * Missing env, Edge Config errors and malformed payloads all resolve OFF.
 */
export async function readNutritionV2RolloutConfig(): Promise<NutritionV2RolloutConfig> {
  if (!process.env.EDGE_CONFIG) return DEFAULT_NUTRITION_V2_ROLLOUT

  try {
    const { get } = await import('@vercel/edge-config')
    const raw = await get<unknown>(EDGE_CONFIG_KEY)
    const decision = resolveNutritionV2Rollout(raw, { surface: 'webStudent' })
    if (decision.reason === 'invalid_config') return DEFAULT_NUTRITION_V2_ROLLOUT
    return raw as NutritionV2RolloutConfig
  } catch {
    return DEFAULT_NUTRITION_V2_ROLLOUT
  }
}

export async function resolveNutritionV2RolloutDecision(
  context: NutritionV2RolloutContext,
): Promise<NutritionV2RolloutDecision> {
  const config = await readNutritionV2RolloutConfig()
  return resolveNutritionV2Rollout(config, context)
}

export async function isNutritionV2Enabled(
  context: NutritionV2RolloutContext,
): Promise<boolean> {
  return (await resolveNutritionV2RolloutDecision(context)).enabled
}
