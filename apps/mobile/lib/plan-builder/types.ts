// Ported 1:1 from web: apps/web/src/app/coach/builder/[clientId]/types.ts
// Keeping the same shape guarantees functional parity + identical persistence.
export type BuilderSection = 'warmup' | 'main' | 'cooldown'

export interface BuilderBlock {
  uid: string
  exercise_id: string
  exercise_name: string
  muscle_group: string
  gif_url?: string
  video_url?: string
  dayId?: number
  sets?: number
  reps?: string
  target_weight_kg?: string
  tempo?: string
  rir?: string
  rest_time?: string
  notes?: string
  superset_group?: string | null
  progression_type?: 'weight' | 'reps' | null
  progression_value?: number | null
  section?: BuilderSection
  is_override?: boolean
}

export interface DayState {
  id: number
  name: string
  title: string
  blocks: BuilderBlock[]
  is_rest?: boolean
  week_variant?: 'A' | 'B'
}

// Program-level structure (from WeeklyPlanBuilder).
export type ProgramStructureType = 'weekly' | 'cycle'
export type DurationType = 'weeks' | 'async' | 'calendar_days'

export interface ProgramMeta {
  structure_type: ProgramStructureType
  duration_type: DurationType
  weeks_to_repeat: number
  uses_week_variants: boolean
}
