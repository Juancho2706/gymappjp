import { supabase } from '../supabase'
import { getClientProfile } from '../client'
import { selectWithFallback } from '../db-compat'

/**
 * Sustitucion de "maquina ocupada" (Fase L · workstream C) — capa de datos + ranking mobile.
 *
 * Puerto 1:1 de la logica pura de ranking de la web (`apps/web/src/services/workout/
 * exercise-substitution.ts`) + resolucion del candidate set via PostgREST directo con la
 * sesion del ALUMNO (RLS gatea la propiedad del plan y el techo del catalogo). Mobile no puede
 * importar de `apps/web`; si la formula de ranking cambia en web hay que reflejarla aca (riesgo
 * de drift anotado). El schema de columnas de log vive en `packages/schemas/workout.ts`.
 *
 * Escritura de columnas (`substituted_exercise_*`/`substitution_reason`): la hace el nucleo al
 * loguear via `buildSubstitutionLogFields` (en `components/alumno/workout/SubstituteExerciseSheet.tsx`).
 */

// ─────────────────────────── ranking puro (mirror web) ───────────────────────────

/** Motivo por defecto v1 (paridad web `SUBSTITUTION_REASON`). Viaja al log. */
export const SUBSTITUTION_REASON = 'machine_busy' as const

/** Familia normalizada del implemento (tier). */
export type EquipmentClass = 'free_weight' | 'cable' | 'body_weight' | 'machine' | 'band' | 'other'

/** Forma minima que necesita el ranking (los candidatos reales traen mas columnas). */
export interface RankableExercise {
  id: string
  name: string
  muscle_group: string | null
  equipment: string | null
  secondary_muscles?: string[] | null
  coach_id?: string | null
  org_id?: string | null
  team_id?: string | null
}

const EQUIPMENT_ALIASES: Record<string, string> = {
  corporal: 'body weight',
  'peso corporal': 'body weight',
  'peso libre': 'dumbbell',
  mancuerna: 'dumbbell',
  mancuernas: 'dumbbell',
  barra: 'barbell',
  polea: 'cable',
  poleas: 'cable',
  maquina: 'machine',
  máquina: 'machine',
  banda: 'band',
  otro: 'other',
  '': 'other',
}

/** Normaliza el texto libre de `equipment` (trim + lowercase + alias legacy/ES). */
export function normalizeEquipment(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  return EQUIPMENT_ALIASES[s] ?? s
}

/** Clasifica un `equipment` (texto libre) en su tier canonico. */
export function classifyEquipment(raw: string | null | undefined): EquipmentClass {
  const s = normalizeEquipment(raw)
  if (/leverage|smith|sled|hack|machine/.test(s)) return 'machine'
  if (/cable|pulley|polea/.test(s)) return 'cable'
  if (/dumbbell|barbell|kettlebell|weighted|trap bar|olympic|ez ?barbell|mancuern|\bbarra\b|pesa rusa/.test(s)) return 'free_weight'
  if (/body ?weight|corporal|suspension/.test(s)) return 'body_weight'
  if (/\bband\b|banda/.test(s)) return 'band'
  return 'other'
}

const EQUIPMENT_CLASS_LABEL_ES: Record<EquipmentClass, string> = {
  free_weight: 'Peso libre',
  cable: 'Cable',
  body_weight: 'Peso corporal',
  machine: 'Máquina',
  band: 'Banda',
  other: 'Otro',
}

/** Etiqueta legible del implemento para la UI (badge). Usa el tier normalizado. */
export function equipmentLabel(raw: string | null | undefined): string {
  return EQUIPMENT_CLASS_LABEL_ES[classifyEquipment(raw)]
}

function isSystemScope(ex: RankableExercise): boolean {
  return ex.coach_id == null && ex.org_id == null && ex.team_id == null
}

function tierScore(cand: EquipmentClass, currentIsMachine: boolean, sameEquipString: boolean, sameClass: boolean): number {
  if (currentIsMachine) {
    if (sameEquipString) return 0
    switch (cand) {
      case 'free_weight': return 100
      case 'cable': return 80
      case 'body_weight': return 60
      case 'band': return 40
      case 'other': return 35
      case 'machine': return 25
    }
  }
  if (sameEquipString || sameClass) return 100
  switch (cand) {
    case 'free_weight': return 70
    case 'cable': return 60
    case 'body_weight': return 45
    case 'machine': return 40
    case 'band': return 35
    case 'other': return 30
  }
}

function secondaryJaccard(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const sa = new Set((a ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
  const sb = new Set((b ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter += 1
  const union = sa.size + sb.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Rankea candidatos y devuelve las top `limit` alternativas al ejercicio prescrito.
 * Orden 100% determinista: score desc → sistema antes que scope propio → `name` asc.
 */
export function rankSubstitutes<T extends RankableExercise>(
  current: RankableExercise,
  candidates: readonly T[],
  opts?: { limit?: number },
): T[] {
  const limit = opts?.limit ?? 5
  const currentClass = classifyEquipment(current.equipment)
  const currentIsMachine = currentClass === 'machine'
  const currentEquipNorm = normalizeEquipment(current.equipment)

  const scored = candidates
    .filter((c) => c.id !== current.id && c.muscle_group === current.muscle_group)
    .map((c) => {
      const cClass = classifyEquipment(c.equipment)
      const cEquipNorm = normalizeEquipment(c.equipment)
      const sameEquipString = currentEquipNorm !== 'other' && cEquipNorm === currentEquipNorm
      const sameClass = cClass === currentClass
      const base = tierScore(cClass, currentIsMachine, sameEquipString, sameClass)
      const bonus = Math.round(secondaryJaccard(current.secondary_muscles, c.secondary_muscles) * 5)
      return { ex: c, score: base + bonus, isSystem: isSystemScope(c), name: c.name ?? '' }
    })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
    return a.name.localeCompare(b.name, 'es')
  })

  return scored.slice(0, Math.max(0, limit)).map((s) => s.ex)
}

// ─────────────────────────── resolucion del candidate set ───────────────────────────

/** Candidato de sustitucion: card del sheet + media para la tecnica. */
export interface SubstituteCandidate extends RankableExercise {
  exercise_type: string | null
  gif_url: string | null
  image_url: string | null
  video_url: string | null
  instructions: string[] | null
}

export interface SubstitutionCandidateSet {
  current: {
    id: string
    name: string
    muscle_group: string | null
    equipment: string | null
    exercise_type: string | null
    secondary_muscles: string[] | null
  }
  /** Candidatos YA rankeados (top primero). */
  candidates: SubstituteCandidate[]
}

type CurrentExercise = {
  id: string
  name: string
  muscle_group: string | null
  equipment?: string | null
  exercise_type?: string | null
  secondary_muscles?: string[] | null
}

type BlockExerciseRow = {
  exercise_id: string | null
  exercises: CurrentExercise | CurrentExercise[] | null
}

/**
 * Resuelve el ejercicio prescrito del bloque + el candidate set same-muscle en scope del alumno,
 * ya rankeado. `null` si el bloque no existe / no es del alumno (RLS) o no tiene grupo muscular.
 *
 * DB-compat: el APK puede pegar a una prod STANDALONE sin `exercise_type`/`secondary_muscles`;
 * `selectWithFallback` reintenta sin esas columnas.
 */
export async function fetchSubstituteCandidates(blockId: string): Promise<SubstitutionCandidateSet | null> {
  // 1) Ejercicio prescrito del bloque (RLS del alumno gatea la propiedad del plan).
  const { data: blockData } = await selectWithFallback<BlockExerciseRow>(
    () =>
      supabase
        .from('workout_blocks')
        .select('exercise_id, exercises ( id, name, muscle_group, equipment, exercise_type, secondary_muscles )')
        .eq('id', blockId)
        .maybeSingle(),
    () =>
      supabase
        .from('workout_blocks')
        .select('exercise_id, exercises ( id, name, muscle_group, equipment )')
        .eq('id', blockId)
        .maybeSingle(),
  )

  const rawExercise = blockData?.exercises
  const current = (Array.isArray(rawExercise) ? rawExercise[0] : rawExercise) ?? null
  if (!current || !current.muscle_group) return null

  const currentNorm = {
    id: current.id,
    name: current.name,
    muscle_group: current.muscle_group,
    equipment: current.equipment ?? null,
    exercise_type: current.exercise_type ?? null,
    secondary_muscles: current.secondary_muscles ?? null,
  }

  // 2) Scope de catalogo del alumno (sistema ∪ su coach) — mismo patron que la pestaña Ejercicios.
  const client = await getClientProfile()
  const scopeFilter = client?.coachId ? `coach_id.is.null,coach_id.eq.${client.coachId}` : 'coach_id.is.null'

  const RICH = 'id, name, muscle_group, equipment, exercise_type, secondary_muscles, gif_url, image_url, video_url, instructions, coach_id'
  const MIN = 'id, name, muscle_group, equipment, gif_url, image_url, video_url, instructions, coach_id'
  const muscle = currentNorm.muscle_group as string

  // 3) Candidate set: mismo grupo muscular + (si aplica) mismo tipo de catalogo + no borrado + distinto.
  const { data } = await selectWithFallback<SubstituteCandidate[]>(
    () => {
      let q = supabase
        .from('exercises')
        .select(RICH)
        .or(scopeFilter)
        .is('deleted_at', null)
        .eq('muscle_group', muscle)
        .neq('id', currentNorm.id)
      if (currentNorm.exercise_type) q = q.eq('exercise_type', currentNorm.exercise_type)
      return q.order('name').limit(60) as unknown as PromiseLike<{ data: SubstituteCandidate[] | null; error: { code?: string; message?: string } | null }>
    },
    () =>
      supabase
        .from('exercises')
        .select(MIN)
        .or(scopeFilter)
        .eq('muscle_group', muscle)
        .neq('id', currentNorm.id)
        .order('name')
        .limit(60) as unknown as PromiseLike<{ data: SubstituteCandidate[] | null; error: { code?: string; message?: string } | null }>,
  )

  const raw: SubstituteCandidate[] = (data ?? []).map((c) => ({
    ...c,
    exercise_type: c.exercise_type ?? null,
    secondary_muscles: c.secondary_muscles ?? null,
    gif_url: c.gif_url ?? null,
    image_url: c.image_url ?? null,
    video_url: c.video_url ?? null,
    instructions: c.instructions ?? null,
  }))

  const ranked = rankSubstitutes(currentNorm, raw, { limit: 50 })
  return { current: currentNorm, candidates: ranked }
}
