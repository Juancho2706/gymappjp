import { z } from 'zod'

export const NutritionV2RolloutModeSchema = z.enum(['off', 'canary', 'on'])

export const NutritionV2RolloutConfigSchema = z.object({
  mode: NutritionV2RolloutModeSchema.default('off'),
  clientIds: z.array(z.string().uuid()).max(500).default([]),
  coachIds: z.array(z.string().uuid()).max(500).default([]),
  teamIds: z.array(z.string().uuid()).max(200).default([]),
  orgIds: z.array(z.string().uuid()).max(200).default([]),
  surfaces: z.object({
    webStudent: z.boolean().default(false),
    webCoach: z.boolean().default(false),
    mobileStudent: z.boolean().default(false),
    mobileCoach: z.boolean().default(false),
  }).default({
    webStudent: false,
    webCoach: false,
    mobileStudent: false,
    mobileCoach: false,
  }),
})

export type NutritionV2RolloutMode = z.infer<typeof NutritionV2RolloutModeSchema>
export type NutritionV2RolloutConfig = z.infer<typeof NutritionV2RolloutConfigSchema>
export type NutritionV2Surface = keyof NutritionV2RolloutConfig['surfaces']

export interface NutritionV2RolloutContext {
  surface: NutritionV2Surface
  userId?: string | null
  clientId?: string | null
  coachId?: string | null
  teamId?: string | null
  orgId?: string | null
}

export interface NutritionV2RolloutDecision {
  enabled: boolean
  mode: NutritionV2RolloutMode
  reason:
    | 'global_off'
    | 'surface_off'
    | 'global_on'
    | 'client_canary'
    | 'coach_canary'
    | 'team_canary'
    | 'org_canary'
    | 'not_in_canary'
    | 'invalid_config'
}

export const DEFAULT_NUTRITION_V2_ROLLOUT: NutritionV2RolloutConfig = {
  mode: 'off',
  clientIds: [],
  coachIds: [],
  teamIds: [],
  orgIds: [],
  surfaces: {
    webStudent: false,
    webCoach: false,
    mobileStudent: false,
    mobileCoach: false,
  },
}

export function normalizeNutritionV2Rollout(input: unknown): NutritionV2RolloutConfig {
  const parsed = NutritionV2RolloutConfigSchema.safeParse(input)
  return parsed.success ? parsed.data : DEFAULT_NUTRITION_V2_ROLLOUT
}

export function resolveNutritionV2Rollout(
  rawConfig: unknown,
  context: NutritionV2RolloutContext,
): NutritionV2RolloutDecision {
  const parsed = NutritionV2RolloutConfigSchema.safeParse(rawConfig)
  if (!parsed.success) {
    return { enabled: false, mode: 'off', reason: 'invalid_config' }
  }

  const config = parsed.data
  if (config.mode === 'off') {
    return { enabled: false, mode: 'off', reason: 'global_off' }
  }
  if (config.surfaces[context.surface] !== true) {
    return { enabled: false, mode: config.mode, reason: 'surface_off' }
  }
  if (config.mode === 'on') {
    return { enabled: true, mode: 'on', reason: 'global_on' }
  }

  if (context.clientId && config.clientIds.includes(context.clientId)) {
    return { enabled: true, mode: 'canary', reason: 'client_canary' }
  }
  if (context.coachId && config.coachIds.includes(context.coachId)) {
    return { enabled: true, mode: 'canary', reason: 'coach_canary' }
  }
  if (context.teamId && config.teamIds.includes(context.teamId)) {
    return { enabled: true, mode: 'canary', reason: 'team_canary' }
  }
  if (context.orgId && config.orgIds.includes(context.orgId)) {
    return { enabled: true, mode: 'canary', reason: 'org_canary' }
  }

  return { enabled: false, mode: 'canary', reason: 'not_in_canary' }
}
