'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PERSONA_COPY, PersonaSchema, type Persona } from '@eva/schemas'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAIN_KEYS,
    normalizePreset,
    type FeatureDomain,
} from '@eva/feature-prefs'
import { NAV_MODULES } from '@eva/coach-nav'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { setTeamFeaturePrefs } from '@/app/coach/settings/_actions/feature-prefs.actions'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import { deleteDemoStudent, seedDemoStudent } from '@/services/onboarding/demo-student.service'
import {
    archivePersonaGuideProgress,
    demoChangeNotice,
    reseedDemoForPersonaChange,
    type DemoChangeResult,
} from '@/services/onboarding/persona-switch.service'
import {
    clearCoachNavOrder,
    readCoachPersona,
    recordOnboardingEvent,
    saveCoachPersona,
    setCoachDomainEnabled,
    setCoachNavOrder,
    writePersonaDomainPrefs,
} from '@/services/coach/persona.service'

/**
 * Write-actions de «Opciones › Mi panel» (onboarding v2, TASKS F2.6).
 *
 * Reglas de la zona:
 *  - Cambiar de especialidad NO reordena el panel por sorpresa: la matriz de la persona solo se
 *    re-ejecuta si el coach marca «Ordenar mi panel según mi especialidad». Sin eso, sus toggles
 *    manuales quedan exactamente como estaban.
 *  - Apagar/prender un dominio es una preferencia y SOLO ACHICA: nunca compra un módulo ni borra
 *    datos (el entitlement server-side sigue siendo el único gate de dinero).
 *  - Cambiar de especialidad SÍ mueve el alumno de ejemplo y la memoria de la guía: el mundo de la
 *    rama nueva es otro (Matías → Pedro) y los pasos 2 y 3 se archivan por especialidad
 *    (`services/onboarding/persona-switch.service`, TASKS W8.1.3).
 *  - El alumno de ejemplo se siembra/borra con el cliente ADMIN porque el trigger
 *    `clients_guard_is_demo` solo deja marcar `is_demo` a `service_role`. La identidad del coach
 *    igual sale de la SESIÓN, nunca del input.
 */

export type MiPanelResult =
    | { ok: true; message: string; demo?: DemoChangeResult }
    | { ok: false; error: string; demo?: DemoChangeResult }

const personaSchema = z.object({
    persona: PersonaSchema,
    alsoOther: z.boolean().optional(),
    /** `true` = re-sembrar los 5 dominios con la matriz de la persona (el coach lo pidió). */
    reorderPanel: z.boolean().optional(),
})

const domainSchema = z.object({
    domain: z.enum(FEATURE_DOMAIN_KEYS),
    enabled: z.boolean(),
})

/**
 * Orden de la barra: los CINCO dominios, sin repetir y sin faltar. Se valida completo a propósito
 * — un orden parcial dejaría a `parseNavOrder` completando el resto por su cuenta y el coach vería
 * una barra que no es la que dejó.
 */
const navOrderSchema = z.object({
    order: z
        .array(z.enum(FEATURE_DOMAIN_KEYS))
        .length(FEATURE_DOMAIN_KEYS.length)
        .refine((value) => new Set(value).size === value.length, { message: 'dominios repetidos' }),
})

/** Master switch de un dominio del POOL. `teamId` viaja en el input; la RLS de managers es el gate. */
const teamDomainSchema = z.object({
    teamId: z.guid(),
    domain: z.enum(FEATURE_DOMAIN_KEYS),
    enabled: z.boolean(),
})

export type SaveMiPanelPersonaInput = z.input<typeof personaSchema>
export type SetMiPanelDomainInput = z.input<typeof domainSchema>
export type SetNavOrderInput = z.input<typeof navOrderSchema>
export type SetTeamDomainInput = z.input<typeof teamDomainSchema>

/** Coach de la sesión + rechazo de cuentas administradas por org/team. */
async function requireStandaloneCoach(): Promise<
    { ok: true; coachId: string } | { ok: false; error: string }
> {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub
    if (!coachId) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_status')
        .eq('id', coachId)
        .maybeSingle()
    if (!coach) return { ok: false, error: 'No encontramos tu cuenta de coach.' }
    if (coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') {
        return { ok: false, error: 'Tu panel lo administra tu organización o tu equipo.' }
    }
    return { ok: true, coachId }
}

/**
 * Coach de la sesión, SIN el rechazo de cuentas managed. Es lo correcto para las preferencias
 * PERSONALES que también valen dentro de un pool (hoy: el orden de la barra — el teléfono es del
 * coach, no del equipo). La RLS `coach_feature_prefs_owner_all` sigue siendo el gate real.
 */
async function requireCoachSession(): Promise<
    { ok: true; coachId: string } | { ok: false; error: string }
> {
    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    const coachId = claims?.claims?.sub
    if (!coachId) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }
    return { ok: true, coachId }
}

/** El nav del coach vive en el layout: sin esto el menú viejo sobrevive hasta una navegación dura. */
function revalidateCoachShell() {
    revalidatePath('/coach/settings')
    revalidatePath('/coach/dashboard', 'layout')
}

/** Cambia la especialidad del coach y, si lo pidió, reordena el panel según esa persona. */
export async function saveMiPanelPersonaAction(input: SaveMiPanelPersonaInput): Promise<MiPanelResult> {
    const parsed = personaSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Elige una de las opciones.' }

    const auth = await requireStandaloneCoach()
    if (!auth.ok) return auth

    const persona: Persona = parsed.data.persona
    const alsoOther =
        PERSONA_COPY[persona].secondQuestion == null ? false : parsed.data.alsoOther === true
    const reorderPanel = parsed.data.reorderPanel === true

    const supabase = await createClient()
    const previous = await readCoachPersona(supabase, auth.coachId)
    const personaChanged = previous.persona != null && previous.persona !== persona

    // MEMORIA de la guía, ANTES de escribir la persona: `archivePersonaGuideProgress` mide los
    // pasos 2 y 3 con el `persona_set_at` viejo y guarda lo hecho en la rama que se abandona. Que
    // falle no aborta nada — la especialidad del coach pesa más que su checklist.
    const memory = await archivePersonaGuideProgress(supabase, {
        coachId: auth.coachId,
        from: previous.persona,
        to: persona,
    })
    if (memory.error) {
        console.error('[mi-panel] no se pudo archivar el progreso de la guía', memory.error)
    }

    const saved = await saveCoachPersona(supabase, auth.coachId, persona, alsoOther)
    if (!saved.ok) {
        console.error('[mi-panel] no se pudo guardar la persona', saved.error)
        return { ok: false, error: 'No pudimos guardar tu especialidad. Inténtalo de nuevo.' }
    }

    if (reorderPanel) {
        const prefs = await writePersonaDomainPrefs(supabase, auth.coachId, persona, alsoOther)
        if (!prefs.ok) {
            console.error('[mi-panel] no se pudieron reordenar los dominios', prefs.error)
            return {
                ok: false,
                error: 'Guardamos tu especialidad, pero no pudimos reordenar el panel. Inténtalo de nuevo.',
            }
        }
        // «Ordenar mi panel según mi especialidad» incluye el ORDEN de la barra: se borra la fila
        // `_nav` para que vuelva a mandar `PERSONA_DOMAIN_ORDER`. Dejar un orden viejo hecho a mano
        // contradiría lo que el coach acaba de pedir. Best-effort: si el delete falla, la
        // especialidad ya quedó guardada y la barra sigue con el orden manual (estado seguro).
        const cleared = await clearCoachNavOrder(supabase, auth.coachId)
        if (!cleared.ok) {
            console.error('[mi-panel] no se pudo limpiar el orden manual de la barra', cleared.error)
        }
    }

    const admin = createServiceRoleClient()

    // El mundo de la rama nueva es OTRO: Matías se va y llega Pedro. Solo cuando la especialidad
    // cambió de verdad (guardar la misma no puede borrarle el ejemplo a nadie).
    const demo: DemoChangeResult = personaChanged
        ? await reseedDemoForPersonaChange(admin, { coachId: auth.coachId, persona, surface: 'web' })
        : { action: 'kept', demoName: PERSONA_COPY[persona].demoName, demoClientId: null, error: null }

    await recordOnboardingEvent(admin, {
        coachId: auth.coachId,
        eventType: 'persona_selected',
        metadata: {
            persona,
            alsoOther,
            surface: 'web',
            source: 'mi_panel',
            changed: previous.persona !== persona,
            reordered: reorderPanel,
            demo: demo.action,
        },
    })
    await capturePostHogServerEvent({
        event: 'persona_selected',
        distinctId: auth.coachId,
        properties: {
            persona,
            also_other: alsoOther,
            surface: 'web',
            source: 'mi_panel',
            changed: previous.persona !== persona,
            demo: demo.action,
        },
        // Sin esto, cambiar de especialidad desde «Mi panel» dejaría el perfil de PostHog con la
        // persona vieja hasta el próximo demo_seeded (W8.5.2).
        set: { persona },
    })

    revalidateCoachShell()
    if (personaChanged) {
        // La guía y el directorio cambiaron de alumno de ejemplo y de pasos tildados.
        revalidatePath('/coach/guia')
        revalidatePath('/coach/clients')
    }

    if (demo.error) return { ok: false, error: demo.error, demo }

    const base = reorderPanel ? 'Especialidad guardada y panel reordenado.' : 'Especialidad guardada.'
    const notice = demoChangeNotice(demo)
    return { ok: true, message: notice ? `${base} ${notice}` : base, demo }
}

/** Master switch de UN dominio. No toca la persona ni los otros dominios. */
export async function setMiPanelDomainAction(input: SetMiPanelDomainInput): Promise<MiPanelResult> {
    const parsed = domainSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }

    const auth = await requireStandaloneCoach()
    if (!auth.ok) return auth

    const supabase = await createClient()
    const result = await setCoachDomainEnabled(
        supabase,
        auth.coachId,
        parsed.data.domain,
        parsed.data.enabled,
    )
    if (!result.ok) {
        console.error('[mi-panel] no se pudo cambiar el dominio', parsed.data.domain, result.error)
        return { ok: false, error: 'No pudimos guardar el cambio. Inténtalo de nuevo.' }
    }

    revalidateCoachShell()
    return { ok: true, message: domainToggleMessage(parsed.data.domain, parsed.data.enabled) }
}

/**
 * ORDEN de la barra del coach (QA del owner 01-09). Preferencia PERSONAL: se guarda en la fila
 * reservada `_nav` de `coach_feature_prefs` con el cliente de la SESIÓN (RLS = gate) y vale también
 * dentro de un pool — por eso NO pasa por `requireStandaloneCoach`.
 *
 * Lo que decide de verdad: qué dos dominios prendidos se ganan un slot de la cápsula móvil
 * (`buildMobileBar`) y en qué orden se listan en «Funciones». No prende ni apaga nada.
 */
export async function setNavOrderAction(input: SetNavOrderInput): Promise<MiPanelResult> {
    const parsed = navOrderSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }

    const auth = await requireCoachSession()
    if (!auth.ok) return auth

    const supabase = await createClient()
    const result = await setCoachNavOrder(supabase, auth.coachId, parsed.data.order as FeatureDomain[])
    if (!result.ok) {
        console.error('[mi-panel] no se pudo guardar el orden de la barra', result.error)
        return { ok: false, error: 'No pudimos guardar el orden. Inténtalo de nuevo.' }
    }

    revalidateCoachShell()
    return { ok: true, message: 'Listo, cambiamos el orden.' }
}

/**
 * Master switch de UN dominio del POOL (scope team). Espejo de `setMiPanelDomainAction` para el
 * equipo: hasta hoy las filas de «Funciones del equipo» eran de solo lectura y el gestor no tenía
 * dónde apagar un área del pool (QA del owner 01-09).
 *
 * Escribe por la MISMA ruta que el editor de secciones (`setTeamFeaturePrefs`): la RLS de
 * `team_feature_prefs` (managers vía `current_user_managed_team_ids`) es el único gate — un coach
 * común del pool no pasa aunque llame la action a mano. Se lee la fila primero para pisar SOLO
 * `_enabled` y no llevarse puesto el detalle fino de nutrición ni el preset del equipo.
 */
export async function setTeamDomainAction(input: SetTeamDomainInput): Promise<MiPanelResult> {
    const parsed = teamDomainSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }

    const supabase = await createClient()
    const { data: claims } = await supabase.auth.getClaims()
    if (!claims?.claims?.sub) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }

    const { data: existing } = await supabase
        .from('team_feature_prefs')
        .select('preset, sections')
        .eq('team_id', parsed.data.teamId)
        .eq('domain', parsed.data.domain)
        .maybeSingle()

    // Solo booleans: `setTeamFeaturePrefs` valida `Record<string, boolean>` y una key con basura
    // guardada haría fallar el upsert entero por algo que el coach no tocó.
    const sections: Record<string, boolean> = {}
    const raw = existing?.sections
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'boolean') sections[key] = value
        }
    }
    sections[DOMAIN_ENABLED_KEY] = parsed.data.enabled

    const result = await setTeamFeaturePrefs({
        teamId: parsed.data.teamId,
        domain: parsed.data.domain,
        preset: normalizePreset(existing?.preset),
        sections,
    })
    if ('error' in result) {
        console.error('[mi-panel] no se pudo cambiar el dominio del equipo', parsed.data.domain, result.error)
        return { ok: false, error: 'No pudimos guardar el cambio. Inténtalo de nuevo.' }
    }

    // `setTeamFeaturePrefs` ya revalida /coach/settings, /coach/team y el layout del panel.
    return { ok: true, message: domainToggleMessage(parsed.data.domain, parsed.data.enabled) }
}

/**
 * Prender un dominio SIN ítem de nav (hoy `bodycomp`: no aparece en `NAV_MODULES`) no cambia nada
 * a la vista — prometer «ya se ve» manda al coach a buscar un menú que no existe. El registro del
 * nav es la fuente de verdad, así que si mañana el dominio gana su ítem el copy se corrige solo.
 */
function domainToggleMessage(domain: (typeof FEATURE_DOMAIN_KEYS)[number], enabled: boolean): string {
    if (!enabled) return 'Listo, lo ocultamos.'
    const hasNavItem = NAV_MODULES.some((item) => item.featureDomain === domain)
    return hasNavItem ? 'Listo, ya se ve.' : 'Listo, lo activamos.'
}

/** Vuelve a sembrar el alumno de ejemplo de la persona actual. Idempotente (lo resuelve W3). */
export async function reseedDemoStudentAction(): Promise<MiPanelResult> {
    const auth = await requireStandaloneCoach()
    if (!auth.ok) return auth

    const supabase = await createClient()
    const { persona } = await readCoachPersona(supabase, auth.coachId)
    if (!persona) return { ok: false, error: 'Primero elige tu especialidad.' }
    if (PERSONA_COPY[persona].demoName == null) {
        return { ok: false, error: 'Tu especialidad no trae alumno de ejemplo.' }
    }

    const admin = createServiceRoleClient()
    const seed = await seedDemoStudent(admin, { coachId: auth.coachId, persona })
    if (!seed.ok) {
        if (seed.reason === 'not_implemented') {
            return { ok: false, error: 'El alumno de ejemplo todavía no está disponible.' }
        }
        console.error('[mi-panel] no se pudo sembrar el alumno de ejemplo', seed.reason, seed.detail)
        return { ok: false, error: 'No pudimos crear el alumno de ejemplo. Inténtalo de nuevo.' }
    }

    await recordOnboardingEvent(admin, {
        coachId: auth.coachId,
        eventType: 'demo_seeded',
        metadata: {
            persona,
            demoClientId: seed.demoClientId,
            alreadyExisted: seed.alreadyExisted,
            source: 'mi_panel',
        },
    })

    revalidateCoachShell()
    revalidatePath('/coach/clients')
    return {
        ok: true,
        message: seed.alreadyExisted
            ? `${PERSONA_COPY[persona].demoName} ya estaba en tu lista.`
            : `${PERSONA_COPY[persona].demoName} volvió a tu lista de alumnos.`,
    }
}

/** Borra el alumno de ejemplo y todo lo que se sembró con él. */
export async function deleteDemoStudentAction(): Promise<MiPanelResult> {
    const auth = await requireStandaloneCoach()
    if (!auth.ok) return auth

    const admin = createServiceRoleClient()
    const deleted = await deleteDemoStudent(admin, { coachId: auth.coachId })
    if (!deleted.ok) {
        if (deleted.reason === 'not_implemented') {
            return { ok: false, error: 'El alumno de ejemplo todavía no está disponible.' }
        }
        console.error('[mi-panel] no se pudo borrar el alumno de ejemplo', deleted.reason)
        return { ok: false, error: 'No pudimos borrar el alumno de ejemplo. Inténtalo de nuevo.' }
    }

    await recordOnboardingEvent(admin, {
        coachId: auth.coachId,
        eventType: 'demo_deleted',
        metadata: { source: 'mi_panel', deleted: deleted.deleted },
    })

    revalidateCoachShell()
    revalidatePath('/coach/clients')
    return {
        ok: true,
        message: deleted.deleted ? 'Listo, borramos el alumno de ejemplo.' : 'No había alumno de ejemplo.',
    }
}
