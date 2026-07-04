'use server'

import { z } from 'zod'
import { getSubstitutionCandidates, type SubstituteCandidate } from '../_data/substitution.queries'
import { rankSubstitutes } from '@/services/workout/exercise-substitution'

/**
 * Sugerencias de sustitución de máquina ocupada (Fase L · workstream C).
 *
 * Lazy (se llama SOLO al tocar el botón "Máquina ocupada / Cambiar" — evento raro, sin prefetch).
 * Valida `blockId` con Zod; la propiedad la gatea la RLS del alumno (sólo ve su plan y su catálogo
 * en scope). Resuelve el candidate set same-muscle y rankea de forma determinista (top 3-5).
 *
 * Archivo `'use server'`: sólo exporta async functions. La const `SUBSTITUTION_REASON`, los tipos
 * y `rankSubstitutes` viven fuera (service / _data).
 */

const InputSchema = z.object({ blockId: z.guid() })

export type SubstituteActionResult =
    | { ok: true; substitutes: SubstituteCandidate[] }
    | { ok: false; error: string }

export async function getExerciseSubstitutionsAction(blockId: string): Promise<SubstituteActionResult> {
    const parsed = InputSchema.safeParse({ blockId })
    if (!parsed.success) return { ok: false, error: 'Bloque inválido.' }

    const set = await getSubstitutionCandidates(parsed.data.blockId)
    if (!set) return { ok: false, error: 'No se pudo resolver el ejercicio de este bloque.' }

    const substitutes = rankSubstitutes(set.current, set.candidates, { limit: 5 })
    return { ok: true, substitutes }
}
