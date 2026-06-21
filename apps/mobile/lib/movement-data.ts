import { supabase } from './supabase'

/**
 * Datos + lógica pura del Screening de Movimiento (mobile, vista ALUMNO read-only).
 *
 * Lecturas DIRECTAS por PostgREST bajo la sesión del ALUMNO (RLS self-select: el alumno
 * solo ve sus propias evaluaciones FINALES). NADA service-role. Espejo de la vista web
 * (apps/web .../c/[coach_slug]/movimiento + StudentMovementView).
 *
 * NOTA anti-drift: el cálculo (composite/band/asymmetry) NO se recalcula acá — se LEE de
 * las columnas ya persistidas por el server con @eva/calc. Solo se mirror-ean las
 * CONSTANTES de catálogo (orden de patrones) verbatim de @eva/calc (packages/calc/src/movement.ts)
 * porque @eva/calc no está mapeado en el tsconfig de mobile. Si cambian los 7 patrones en
 * web, actualizar acá.
 */

export type PriorityBand = 'low' | 'moderate' | 'high'

export type MovementPatternSlug =
  | 'deep_squat'
  | 'hurdle_step'
  | 'inline_lunge'
  | 'shoulder_mobility'
  | 'active_straight_leg_raise'
  | 'trunk_stability_pushup'
  | 'rotary_stability'

/** Orden visual canónico de los 7 patrones — verbatim de @eva/calc MOVEMENT_PATTERN_SLUGS. */
export const MOVEMENT_PATTERN_ORDER: readonly MovementPatternSlug[] = [
  'deep_squat',
  'hurdle_step',
  'inline_lunge',
  'shoulder_mobility',
  'active_straight_leg_raise',
  'trunk_stability_pushup',
  'rotary_stability',
] as const

/** Labels es-CL de los patrones (espejo de assessment.pattern.* en los locales de web). */
export const PATTERN_LABELS: Record<MovementPatternSlug, string> = {
  deep_squat: 'Sentadilla profunda',
  hurdle_step: 'Paso de valla',
  inline_lunge: 'Desplante en línea',
  shoulder_mobility: 'Movilidad de hombro',
  active_straight_leg_raise: 'Elevación de pierna activa',
  trunk_stability_pushup: 'Estabilidad de tronco (flexión)',
  rotary_stability: 'Estabilidad rotatoria',
}

/** Etiqueta + color de la banda de prioridad (espejo de PriorityBadge.tsx). */
export const BAND_META: Record<PriorityBand, { label: string; color: string }> = {
  high: { label: 'Prioridad alta', color: '#EF4444' },
  moderate: { label: 'Prioridad media', color: '#F59E0B' },
  low: { label: 'Prioridad baja', color: '#10B981' },
}

export interface MovementItem {
  id: string
  pattern: MovementPatternSlug
  is_per_side: boolean
  score_left: number | null
  score_right: number | null
  score_single: number | null
  final_score: number
  pain: boolean
  clearing_positive: boolean | null
  comment: string | null
}

export interface MovementFinal {
  id: string
  assessed_at: string
  composite_score: number | null
  has_pain: boolean
  has_asymmetry: boolean
  risk_band: PriorityBand | null
  notes: string | null
  items: MovementItem[]
}

const ITEM_COLUMNS =
  'id, assessment_id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain, clearing_positive, comment'
const ASSESSMENT_COLUMNS =
  'id, assessed_at, composite_score, has_pain, has_asymmetry, risk_band, notes'

/**
 * Evaluaciones FINALES del propio alumno con sus items, de más antigua a más nueva
 * (igual orden que la web → la última del array es la más reciente). RLS self-select.
 */
export async function listMyMovementFinals(): Promise<MovementFinal[]> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return []
    const { data } = await supabase
      .from('movement_assessments')
      .select(`${ASSESSMENT_COLUMNS}, movement_assessment_items ( ${ITEM_COLUMNS} )`)
      .eq('client_id', uid)
      .eq('status', 'final')
      .order('assessed_at', { ascending: true })
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      assessed_at: r.assessed_at,
      composite_score: r.composite_score ?? null,
      has_pain: !!r.has_pain,
      has_asymmetry: !!r.has_asymmetry,
      risk_band: (r.risk_band ?? null) as PriorityBand | null,
      notes: r.notes ?? null,
      items: ((r.movement_assessment_items ?? []) as any[]).map((i) => ({
        id: i.id,
        pattern: i.pattern as MovementPatternSlug,
        is_per_side: !!i.is_per_side,
        score_left: i.score_left ?? null,
        score_right: i.score_right ?? null,
        score_single: i.score_single ?? null,
        final_score: i.final_score ?? 0,
        pain: !!i.pain,
        clearing_positive: i.clearing_positive ?? null,
        comment: i.comment ?? null,
      })),
    })) as MovementFinal[]
  } catch {
    return []
  }
}

/** Items en el orden canónico de los 7 patrones (filtra los ausentes). */
export function orderedItems(items: MovementItem[]): MovementItem[] {
  return MOVEMENT_PATTERN_ORDER.map((slug) => items.find((i) => i.pattern === slug)).filter(
    (i): i is MovementItem => i != null
  )
}
