'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { ONBOARDING_STEP_KEYS } from '@eva/onboarding'

/**
 * `completed` acepta los 5 pasos v2 y los 2 legacy del checklist v1 (`first_plan`,
 * `first_checkin`): las cuentas viejas tienen esas keys guardadas y un `.strict()` que las
 * rechazara haría fallar el primer guardado de un coach que ya usó la guía anterior.
 */
const completedSchema = z
    .object({
        profile_branding: z.boolean().optional(),
        vive_tu_app: z.boolean().optional(),
        first_artifact: z.boolean().optional(),
        first_client: z.boolean().optional(),
        aha: z.boolean().optional(),
        // Legacy v1 — se leen, no se escriben desde la UI nueva.
        first_plan: z.boolean().optional(),
        first_checkin: z.boolean().optional(),
    })
    .strict()
    .optional()

const onboardingGuideSchema = z.object({
    /** La guía se fue al pie del dashboard (5/5 u «Ocultar»). */
    dismissed: z.boolean().optional(),
    /** La tira del pie también se cerró: la guía no se pinta más. */
    hidden: z.boolean().optional(),
    completed: completedSchema,
    /**
     * Pasos cuyo `step_completed` ya se emitió. La DB deduplica con un índice único parcial, pero
     * sin esta lista el cliente reintentaba el POST en cada render (el re-emit que dejó 2.293 filas
     * de `first_client` para 19 coaches).
     */
    emitted: z.array(z.enum(ONBOARDING_STEP_KEYS)).max(ONBOARDING_STEP_KEYS.length).optional(),
    ahaMomentSent: z.boolean().optional(),
    /**
     * Sello de la PRIMERA visita a `/coach/guia` (decisión del owner 22-08: la guía es una
     * pantalla propia y todo coach la ve una vez antes que el dashboard). Lo escribe la pantalla
     * al montarse y es lo único que apaga ese redirect, así que la clave viaja en snake_case:
     * el merge de abajo la deja tal cual en el jsonb (`onboarding_guide.guide_seen_at`).
     *
     * Fecha ISO validada por `Date.parse` en vez de `z.string().datetime()`: mismo efecto sin
     * atarse a la API de una versión concreta de zod.
     */
    guide_seen_at: z
        .string()
        .min(1)
        .max(64)
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida')
        .optional(),
})

export type OnboardingGuidePayload = z.infer<typeof onboardingGuideSchema>

export async function persistOnboardingGuideAction(
    payload: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsed = onboardingGuideSchema.safeParse(payload)
    if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0]?.message ?? 'Payload inválido' }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, error: 'No autenticado' }
    }

    // Merge con el guide existente — NO reemplazar. Antes hacía un replace total que
    // pisaba otras keys del mismo jsonb (invite_code_confirmed, brand_tour_seen, y desde
    // onboarding v2 también el inventario `demo` del alumno de ejemplo), lo que hacía
    // reaparecer el modal de "código corto" en cada carga del dashboard.
    const { data: current } = await supabase
        .from('coaches')
        .select('onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    const existing =
        current?.onboarding_guide != null &&
        typeof current.onboarding_guide === 'object' &&
        !Array.isArray(current.onboarding_guide)
            ? (current.onboarding_guide as Record<string, unknown>)
            : {}

    // `completed` también se mergea: la guía v2 solo manda los pasos que tildó en esta sesión y
    // las keys legacy del checklist v1 tienen que sobrevivir.
    const existingCompleted =
        existing.completed != null && typeof existing.completed === 'object' && !Array.isArray(existing.completed)
            ? (existing.completed as Record<string, unknown>)
            : {}

    const merged: Json = {
        ...existing,
        ...parsed.data,
        ...(parsed.data.completed
            ? { completed: { ...existingCompleted, ...parsed.data.completed } as Json }
            : {}),
    } as Json

    const { error } = await supabase
        .from('coaches')
        .update({
            onboarding_guide: merged,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        console.error('[persistOnboardingGuideAction]', error)
        return { ok: false, error: error.message }
    }

    revalidatePath('/coach/dashboard')
    return { ok: true }
}

export async function markBrandTourSeenAction(): Promise<{ ok: true } | { ok: false; error: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false, error: 'No autenticado' }
    }

    const { data: current } = await supabase
        .from('coaches')
        .select('onboarding_guide')
        .eq('id', user.id)
        .maybeSingle()

    const existing =
        current?.onboarding_guide != null &&
        typeof current.onboarding_guide === 'object' &&
        !Array.isArray(current.onboarding_guide)
            ? (current.onboarding_guide as Record<string, unknown>)
            : {}

    const updated: Json = { ...existing, brand_tour_seen: true }

    const { error } = await supabase
        .from('coaches')
        .update({ onboarding_guide: updated, updated_at: new Date().toISOString() })
        .eq('id', user.id)

    if (error) {
        console.error('[markBrandTourSeenAction]', error)
        return { ok: false, error: error.message }
    }

    revalidatePath('/coach/settings')
    return { ok: true }
}
