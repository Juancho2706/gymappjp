'use server'

/**
 * Write-actions de la zona "Funciones" (plan §4 / §9 Fase C).
 *
 * Modelo (plan §4.1): `visible = ENTITLED(billing, server-side, fail-closed) AND ENABLED(pref)`.
 * Estas actions escriben SOLO la capa ENABLED (preferencia). La preferencia **solo achica**: nunca
 * widen-ea entitlement. El gate de dinero vive en el resolver server-side (no aca).
 *
 * Invariantes load-bearing (CLAUDE.md §8.2 / plan §8.2):
 * - Un toggle escribe SOLO `*_feature_prefs.sections`/`preset`. NUNCA toca `coaches.enabled_modules`
 *   ni `teams.enabled_modules` (compra-only, los pisaria el trigger D1 y/o regalaria features pagas).
 * - Un toggle NUNCA borra/anula filas `nutrition_*` (CASCADE meal-logs = data-loss). Apagar = ocultar.
 *
 * Autorizacion:
 * - coach: `coachId` viene de la sesion (`getClaims().sub`), nunca del body (CLAUDE.md anti-IDOR).
 * - team: la RLS de `team_feature_prefs` (managers via `current_user_managed_team_ids`) es el gate.
 * - client: la RLS de `client_feature_prefs` (coach owner / managers de pool) es el gate.
 * El upsert corre como el usuario autenticado (no service-role) → RLS authoritative.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NUTRITION_SECTIONS, PRESETS } from '@eva/feature-prefs'

export type FeaturePrefsResult =
    | { success: true }
    | { error: string; fieldErrors?: Record<string, string[]> }

// ── Zod v4 schemas ───────────────────────────────────────────────────────────

/** Keys validas de seccion del dominio nutricion (espejo de `NutritionSectionKey`, plan §4.3). */
const NUTRITION_SECTION_KEYS = NUTRITION_SECTIONS.map((s) => s.key) as [string, ...string[]]

/** preset ∈ {basico,intermedio,profesional}. La migracion dropeo el CHECK → la app valida (plan §4.4). */
const presetSchema = z.enum(PRESETS)

const domainSchema = z.string().trim().min(1, 'domain requerido')

/**
 * `sections`: record de booleans keyed por `NutritionSectionKey`. Keys desconocidas se rechazan
 * (no se persiste basura), valores no-boolean se rechazan.
 */
const sectionsSchema = z.record(z.enum(NUTRITION_SECTION_KEYS), z.boolean())

const coachPrefsSchema = z.object({
    domain: domainSchema,
    preset: presetSchema,
    sections: sectionsSchema,
})

const teamPrefsSchema = z.object({
    teamId: z.string().uuid('teamId invalido'),
    domain: domainSchema,
    preset: presetSchema,
    sections: sectionsSchema,
})

const clientPrefsSchema = z.object({
    clientId: z.string().uuid('clientId invalido'),
    domain: domainSchema,
    // `client_feature_prefs` NO tiene columna `preset` (solo override de secciones, plan §4.2).
    sections: sectionsSchema,
})

export type SetCoachFeaturePrefsInput = z.input<typeof coachPrefsSchema>
export type SetTeamFeaturePrefsInput = z.input<typeof teamPrefsSchema>
export type SetClientFeaturePrefsInput = z.input<typeof clientPrefsSchema>

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Upsert de las preferencias del coach standalone (`coach_feature_prefs`, PK `coach_id,domain`).
 * `coachId` se deriva de la sesion — nunca del input. RLS `coach_feature_prefs_owner_all` lo cubre.
 */
export async function setCoachFeaturePrefs(
    input: SetCoachFeaturePrefsInput,
): Promise<FeaturePrefsResult> {
    const parsed = coachPrefsSchema.safeParse(input)
    if (!parsed.success) {
        return { error: 'Datos invalidos.', fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const coachId = data?.claims?.sub
    if (!coachId) return { error: 'No autenticado.' }

    const { error } = await supabase
        .from('coach_feature_prefs')
        .upsert(
            {
                coach_id: coachId,
                domain: parsed.data.domain,
                preset: parsed.data.preset,
                sections: parsed.data.sections,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'coach_id,domain' },
        )

    if (error) return { error: error.message }

    revalidatePath('/coach/settings')
    revalidatePath('/coach/dashboard', 'layout')
    return { success: true }
}

/**
 * Upsert de las preferencias del team (`team_feature_prefs`, PK `team_id,domain`). En modo team la
 * capa "coach" se reemplaza por esta (plan §4.9). La RLS (manager via `current_user_managed_team_ids`)
 * es el unico gate de quien puede escribir — un coach comun del pool no pasa.
 */
export async function setTeamFeaturePrefs(
    input: SetTeamFeaturePrefsInput,
): Promise<FeaturePrefsResult> {
    const parsed = teamPrefsSchema.safeParse(input)
    if (!parsed.success) {
        return { error: 'Datos invalidos.', fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    if (!data?.claims?.sub) return { error: 'No autenticado.' }

    const { error } = await supabase
        .from('team_feature_prefs')
        .upsert(
            {
                team_id: parsed.data.teamId,
                domain: parsed.data.domain,
                preset: parsed.data.preset,
                sections: parsed.data.sections,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'team_id,domain' },
        )

    if (error) return { error: error.message }

    revalidatePath('/coach/settings')
    revalidatePath('/coach/team')
    revalidatePath('/coach/dashboard', 'layout')
    return { success: true }
}

/**
 * Upsert del override por-alumno (`client_feature_prefs`, PK `client_id,domain`). Capa mas especifica
 * (most-specific-wins, plan §4.4). La RLS (coach owner / managers de pool) es el gate. Sin columna
 * `preset` — solo override de secciones sobre la base coach/team.
 */
export async function setClientFeaturePrefs(
    input: SetClientFeaturePrefsInput,
): Promise<FeaturePrefsResult> {
    const parsed = clientPrefsSchema.safeParse(input)
    if (!parsed.success) {
        return { error: 'Datos invalidos.', fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    if (!data?.claims?.sub) return { error: 'No autenticado.' }

    const { error } = await supabase
        .from('client_feature_prefs')
        .upsert(
            {
                client_id: parsed.data.clientId,
                domain: parsed.data.domain,
                sections: parsed.data.sections,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'client_id,domain' },
        )

    if (error) return { error: error.message }

    revalidatePath('/coach/settings')
    revalidatePath('/coach/clients/[clientId]', 'page')
    revalidatePath('/coach/dashboard', 'layout')
    return { success: true }
}
