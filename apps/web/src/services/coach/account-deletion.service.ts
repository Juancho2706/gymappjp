import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * services/coach/account-deletion.service — pre-borrado de las filas del coach cuyo FK a
 * `coaches(id)` NO cascadea. Fuente única de verdad de los tres caminos que borran un coach:
 * la server action de la web (`coach/settings/_actions/settings.actions.ts`), el borrado del
 * admin (`admin/(panel)/coaches/_actions/coach-actions.ts`) y la purga a 30 días del cron
 * (`api/cron/purge-data`), que es donde aterriza la baja en-app de `/api/mobile/account/delete`.
 *
 * POR QUE EXISTE: `auth.admin.deleteUser(coachId)` cascadea a `coaches` (baseline 2199,
 * `coaches_id_fkey ... ON DELETE CASCADE`), y de ahí a casi todo. Pero tres FKs quedaron en
 * NO ACTION en el baseline:
 *   · `foods_coach_id_fkey`           (00000000000001_baseline.sql:2239)
 *   · `nutrition_plans_coach_id_fkey` (00000000000001_baseline.sql:2339)
 *   · `saved_meals_coach_id_fkey`     (00000000000001_baseline.sql:2379)
 * Con una sola fila viva en cualquiera de ellas, Postgres rechaza el `deleteUser` con violación de
 * FK y la baja falla entera. Sin DDL: no se tocan las constraints (cambiarlas a CASCADE es una
 * migración con su propio riesgo, no un bugfix).
 *
 * ⚠️ NO AUTORIZA. Corre con `service role` (bypassea RLS): el caller DEBE haber verificado antes
 * que puede borrar a ese coach (sesión propia, `assertAdmin`, o la cola del cron).
 */

/**
 * Orden de borrado — HIJOS ANTES QUE PADRES. No es alfabético ni arbitrario:
 *
 * 1. `nutrition_plans` PRIMERO. Cascadea `nutrition_meals` (baseline 2294) y de ahí `food_items`
 *    (baseline 2229). Y `food_items_food_id_fkey` → `foods(id)` es **NO ACTION** (baseline 2224):
 *    si `foods` se borra antes, cualquier alimento propio del coach usado en una comida de sus
 *    planes hace fallar el DELETE. Ese era el orden del admin (`saved_meals, foods,
 *    nutrition_plans`) y por eso el admin también se rompía con un coach que usó sus alimentos.
 * 2. `saved_meals` después. Cascadea `saved_meal_items` (baseline 2374), que también apunta a
 *    `foods` (ahí sí CASCADE, baseline 2369) — igual se borra el padre explícito y no se depende
 *    de una cascada lateral.
 * 3. `foods` al final: ya no queda nada del coach apuntándole.
 *
 * FKs a `coaches(id)` SIN cascada que a propósito NO se tocan acá (borrar en silencio la fila de
 * otro coach o un registro de auditoría es peor que fallar con la constraint en el log):
 *   · `nutrition_plans_v2.coach_id` ON DELETE RESTRICT (20260714190000:12) — en la práctica no
 *     bloquea porque `nutrition_plans_v2.client_id` cascadea desde `clients` y los tres callers
 *     borran los alumnos ANTES; el residuo es un plan V2 escrito para el alumno de otro coach.
 *   · `teams.owner_coach_id` ON DELETE RESTRICT (20260609050855:17).
 *   · `coupon_redemptions.coach_id` ON DELETE RESTRICT (20260620120000:84) — ledger append-only,
 *     evidencia SERNAC: no se borra.
 *   · `nutrition_item_substitutions_v2.food_id` ON DELETE RESTRICT (20260721150000:34) → mismo
 *     razonamiento que V2: muere por cascada al borrar los alumnos.
 *   · `enterprise_members.coach_id`, `enterprise_coach_assignments.coach_id` y
 *     `workout_programs.created_by_coach_id` (Enterprise, congelado).
 */
export const COACH_OWNED_PURGE_TABLES = ['nutrition_plans', 'saved_meals', 'foods'] as const

export type CoachOwnedPurgeTable = (typeof COACH_OWNED_PURGE_TABLES)[number]

export type PurgeCoachOwnedRowsResult = {
    /** Mensaje del primer DELETE que falló. Ausente = las tres tablas quedaron vacías. */
    error?: string
    /** Tabla en la que se cortó (para el log del caller). */
    table?: CoachOwnedPurgeTable
}

/**
 * Vacía las filas del coach `coachId` en las tablas con FK NO ACTION, en el orden de arriba.
 *
 * FAIL-FAST a propósito: si una tabla falla se corta ahí y NO se sigue. Seguir solo agrega
 * borrados parciales sobre una cuenta que igual no se va a poder eliminar (el `deleteUser`
 * siguiente moriría con la misma violación de FK); mejor un estado reintentable.
 *
 * @param adminDb cliente `service role` (`createServiceRoleClient()`), nunca el del navegador.
 * @param coachId id del coach — permisos YA verificados por el caller.
 */
export async function purgeCoachOwnedRows(
    adminDb: DB,
    coachId: string
): Promise<PurgeCoachOwnedRowsResult> {
    for (const table of COACH_OWNED_PURGE_TABLES) {
        const { error } = await adminDb.from(table).delete().eq('coach_id', coachId)
        if (error) {
            console.error('[coach-deletion] no se pudo vaciar una tabla NO ACTION del coach', {
                coachId,
                table,
                message: error.message,
            })
            return { error: error.message, table }
        }
    }
    return {}
}
