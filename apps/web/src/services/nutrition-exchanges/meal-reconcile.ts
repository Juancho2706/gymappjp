/**
 * Reconciliación de comidas para el guardado del plan en modo 'exchanges'
 * (mustFix R1 del review del módulo `nutrition_exchanges`).
 *
 * El matching legacy del guardado (`upsertClientNutritionPlanJson`) empareja comidas
 * existentes por `order_index` y actualiza in-place — preserva el ROW ID por POSICIÓN.
 * Pero `meal_exchange_targets` y `nutrition_meals.day_variant_id` están pegados al
 * ROW ID: tras un drag-and-drop + guardar, 'Cena' heredaba las porciones de 'Desayuno'
 * (y viceversa) en DB y en la app del alumno; borrar una comida intermedia desplazaba
 * todo y CASCADE-borraba los targets de la ÚLTIMA comida en vez de la eliminada.
 *
 * En modo exchanges el builder envía el id de DB de cada comida persistida ⇒ acá se
 * matchea por ID: la prescripción por porciones viaja SIEMPRE con su comida. El modo
 * gramos conserva el matching por posición byte-identical (AC1) — no pasa por acá.
 *
 * PURA (sin IO, sin Supabase) para ser unit-testeable; el caller ejecuta el resultado.
 */

export type ReconcileIncoming<T> = {
    /** Id de DB que el builder declara para la comida (null = comida nueva). */
    dbId: string | null
    item: T
}

export type ReconcileResult<T> = {
    /** Filas existentes que el coach eliminó (CASCADE borra SUS targets, no los de otra). */
    toDelete: string[]
    /** Update in-place por ID: conserva row id ⇒ targets/variante/meal_logs viajan con la comida. */
    toUpdate: { existingId: string; item: T }[]
    /** Comidas nuevas (sin id, o con id que ya no existe en el plan — insert defensivo). */
    toInsert: T[]
}

export function reconcileMealsById<T>(
    existingIds: string[],
    incoming: ReconcileIncoming<T>[]
): ReconcileResult<T> {
    const existing = new Set(existingIds)
    const claimed = new Set<string>()
    const toUpdate: { existingId: string; item: T }[] = []
    const toInsert: T[] = []

    for (const { dbId, item } of incoming) {
        // Un id solo puede reclamar SU fila y solo una vez (payload duplicado ⇒ insert defensivo).
        if (dbId && existing.has(dbId) && !claimed.has(dbId)) {
            claimed.add(dbId)
            toUpdate.push({ existingId: dbId, item })
        } else {
            toInsert.push(item)
        }
    }

    const toDelete = existingIds.filter((id) => !claimed.has(id))
    return { toDelete, toUpdate, toInsert }
}
