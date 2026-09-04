import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveCatalogScope } from '@/app/c/[coach_slug]/exercises/_data/exercises.queries'
import { effectiveExerciseType } from '@eva/workout-engine'
import type { RankableExercise } from '@/services/workout/exercise-substitution'

/**
 * Candidatos de sustitución de máquina ocupada (Fase L · workstream C, DC-2).
 *
 * Dado un `blockId` del plan del alumno, resuelve el ejercicio PRESCRITO del bloque (RLS del
 * alumno: `clients_read_blocks`) y arma el conjunto candidato del MISMO grupo muscular visible en
 * su scope de catálogo (sistema ∪ coach/team/org, vía `resolveCatalogScope`). NO rankea — eso es
 * capa pura (`rankSubstitutes`). Columnas específicas (nunca `SELECT *`).
 */

/** Columnas del candidato: card del sheet + override del ejercicio en la exec (técnica/gif/detalle). */
const SUBSTITUTE_COLUMNS =
    'id, name, muscle_group, equipment, exercise_type, gif_url, video_url, thumbnail_url, video_start_time, video_end_time, instructions, secondary_muscles, coach_id, org_id, team_id' as const

/** Ejercicio candidato tal como se devuelve (raw): alimenta el ranking y el render de la card. */
export type SubstituteCandidate = RankableExercise & {
    exercise_type: string | null
    gif_url: string | null
    video_url: string | null
    thumbnail_url: string | null
    video_start_time: number | null
    video_end_time: number | null
    instructions: string[] | null
}

export type SubstitutionCandidateSet = {
    current: RankableExercise & { exercise_type: string | null }
    candidates: SubstituteCandidate[]
}

/**
 * Resuelve el ejercicio del bloque + el candidate set same-muscle en scope del alumno.
 * Devuelve `null` si el bloque no existe / no es del alumno (RLS) o no tiene ejercicio.
 */
export const getSubstitutionCandidates = cache(
    async (blockId: string): Promise<SubstitutionCandidateSet | null> => {
        const supabase = await createClient()

        const scope = await resolveCatalogScope(supabase)
        if (!scope) return null

        // Ejercicio prescrito del bloque (RLS del alumno gatea la propiedad del plan).
        // `exercise_type_override` (R5): el coach puede prescribir un ejercicio del catálogo con OTRO
        // tipo (una sentadilla usada como movilidad). El tipo que manda es el EFECTIVO.
        const { data: block } = await supabase
            .from('workout_blocks')
            .select(
                'exercise_id, exercise_type_override, exercises ( id, name, muscle_group, equipment, exercise_type, secondary_muscles )'
            )
            .eq('id', blockId)
            .maybeSingle()

        const rawExercise = block?.exercises
        const currentExercise = (Array.isArray(rawExercise) ? rawExercise[0] : rawExercise) as
            | {
                  id: string
                  name: string
                  muscle_group: string | null
                  equipment: string | null
                  exercise_type: string | null
                  secondary_muscles: string[] | null
              }
            | null
            | undefined
        if (!currentExercise || !currentExercise.muscle_group) return null

        // Tipo EFECTIVO del bloque (R5): override del bloque > tipo del catálogo > 'strength'. Un
        // bloque legacy (sin override, ejercicio sin tipo) sigue resolviendo 'strength'.
        const effectiveType = effectiveExerciseType(
            { exercise_type_override: block?.exercise_type_override },
            currentExercise
        )

        // Candidate set: mismo grupo muscular + mismo tipo EFECTIVO + no borrado + distinto del
        // prescrito, dentro del scope de catálogo del alumno (RLS de `exercises` = techo real).
        // Sin candidatos la lista vuelve vacía y la UI dice «No hay reemplazos de este tipo»: cambiar
        // una movilidad por una serie de fuerza rompería la prescripción tipada del bloque.
        let q = supabase
            .from('exercises')
            .select(SUBSTITUTE_COLUMNS)
            .or(scope.scopeFilter)
            .is('deleted_at', null)
            .eq('muscle_group', currentExercise.muscle_group)
            .neq('id', currentExercise.id)
        // En 'strength' entran también los del catálogo SIN tipo: su tipo efectivo ES 'strength'
        // (`effectiveExerciseType`), y excluirlos vaciaría el sheet en los catálogos legacy. Los dos
        // `.or()` se combinan con AND en PostgREST (scope ∧ tipo).
        q =
            effectiveType === 'strength'
                ? q.or('exercise_type.eq.strength,exercise_type.is.null')
                : q.eq('exercise_type', effectiveType)

        const { data } = await q.order('name').limit(60)
        const candidates = (data ?? []) as unknown as SubstituteCandidate[]

        return {
            current: {
                id: currentExercise.id,
                name: currentExercise.name,
                muscle_group: currentExercise.muscle_group,
                equipment: currentExercise.equipment,
                secondary_muscles: currentExercise.secondary_muscles,
                // El tipo EFECTIVO, no el del catálogo: es el que gobierna el candidate set de arriba.
                exercise_type: effectiveType,
            },
            candidates,
        }
    },
)
