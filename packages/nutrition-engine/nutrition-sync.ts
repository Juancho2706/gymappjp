/**
 * Lógica PURA de reconciliación de comidas al propagar una plantilla / guardar un plan de
 * nutrición a los planes de los alumnos. Extraída de NutritionService.propagateTemplateChanges
 * para poder testearla sin tocar la DB (el codebase testea funciones puras, no el chain de
 * Supabase). Vive en @eva/nutrition-engine para ser CONSUMIDA por web (@eva/web) y mobile
 * (apps/mobile) — una sola fuente de verdad de la cascade-safety, no una copia por app.
 *
 * Invariantes que protege:
 *  - E1 / preservación de IDs: una comida existente cuyo `order_index` sigue en la
 *    plantilla se UPDATEa in-place (mismo `id`) -> nutrition_meal_logs sobreviven.
 *  - Cascade-safety (CRÍTICO): nutrition_meal_logs.meal_id -> nutrition_meals es
 *    ON DELETE CASCADE / SET NULL. Borrar una comida con historial elimina/orfaniza la
 *    adherencia del alumno. Por eso una comida "huérfana" (order_index ya no en la plantilla)
 *    SOLO se borra si NO tiene logs; si los tiene, se CONSERVA (preservedWithLogs).
 *
 * Limitación conocida (decisión de producto pendiente): el match es por `order_index`.
 * Si el coach REORDENA comidas, una comida con logs en el índice N puede quedar con el
 * contenido de otra comida (UPDATE in-place sobreescribe nombre/items aunque los logs
 * apunten a lo viejo). Resolverlo del todo exige una clave estable (template_meal_id en
 * nutrition_meals) — fuera de alcance acá. Acá solo se garantiza que la comida con logs
 * NO se BORRA. Ver test "reorden: comida con logs no se borra".
 */

export type ExistingMeal = { id: string; order_index: number }

export type ReconcileTemplateMeal = {
    order_index: number
    name: string
    description: string
    day_of_week: number | null
}

export type MealUpdate = ReconcileTemplateMeal & { id: string }

export type MealReconciliation = {
    /** ids de comidas a BORRAR (huérfanas y SIN logs) */
    toDelete: string[]
    /** ids de comidas huérfanas CON logs -> se conservan (no se borran) */
    preservedWithLogs: string[]
    /** comidas existentes que matchean un order_index de la plantilla -> UPDATE in-place (id preservado) */
    toUpdate: MealUpdate[]
    /** comidas de la plantilla sin comida existente en ese order_index -> INSERT */
    toInsert: ReconcileTemplateMeal[]
}

export function reconcileMeals(
    existingMeals: ExistingMeal[],
    templateMeals: ReconcileTemplateMeal[],
    loggedMealIds: ReadonlySet<string>
): MealReconciliation {
    const existingByIndex = new Map<number, string>()
    for (const m of existingMeals) existingByIndex.set(m.order_index, m.id)

    const newIndices = new Set(templateMeals.map((m) => m.order_index))

    const toDelete: string[] = []
    const preservedWithLogs: string[] = []
    for (const m of existingMeals) {
        if (newIndices.has(m.order_index)) continue // sigue en la plantilla -> se UPDATEa, no se borra
        if (loggedMealIds.has(m.id)) preservedWithLogs.push(m.id) // tiene historial -> conservar
        else toDelete.push(m.id)
    }

    const toUpdate: MealUpdate[] = []
    const toInsert: ReconcileTemplateMeal[] = []
    for (const t of templateMeals) {
        const id = existingByIndex.get(t.order_index)
        if (id) toUpdate.push({ ...t, id })
        else toInsert.push(t)
    }

    return { toDelete, preservedWithLogs, toUpdate, toInsert }
}
