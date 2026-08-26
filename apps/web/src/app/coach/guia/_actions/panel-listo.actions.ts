'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'
import { createClient } from '@/lib/supabase/server'
import { setCoachDomainEnabled } from '@/services/coach/persona.service'

/**
 * Persistencia del modal «Tu panel quedó listo 💪» (guía del coach).
 *
 * El modal dejó de ser un acuse de recibo: el coach ve los 5 dominios con su switch y decide AHÍ
 * MISMO, antes de seguir con la guía (pedido literal del owner: «lo que no quiero es que luego diga
 * ¿y mi nutrición? ¿y mi cardio?»). «Continuar» manda SOLO lo que difiere de lo que sembró la matriz
 * de la persona; si no cambió nada, el modal cierra sin escribir y esta action nunca corre.
 *
 * El write es EXACTAMENTE el de «Opciones › Mi panel» (`setMiPanelDomainAction`): mismo servicio
 * (`setCoachDomainEnabled`, que preserva preset y toggles finos y solo pisa `_enabled`) y misma
 * revalidación del shell. Lo único propio es el LOTE: en un solo round-trip se guardan los dominios
 * que el coach tocó, en vez de encadenar N server actions con N revalidaciones.
 *
 * Como en «Mi panel», apagar/prender acá es una PREFERENCIA y solo achica: no compra un módulo ni
 * borra datos, y el entitlement server-side sigue siendo el único gate de dinero.
 */

const inputSchema = z.object({
    changes: z
        .array(z.object({ domain: z.enum(FEATURE_DOMAIN_KEYS), enabled: z.boolean() }))
        .min(1)
        .max(FEATURE_DOMAIN_KEYS.length * 2),
})

export type SavePanelListoInput = z.input<typeof inputSchema>
export type SavePanelListoResult = { ok: true; saved: number } | { ok: false; error: string }

/**
 * Coach de la sesión + rechazo de cuentas administradas por org/team.
 *
 * ⚠️ Copia deliberada de `requireStandaloneCoach` de
 * `coach/settings/funciones/_actions/mi-panel.actions.ts`: ese archivo es `'use server'`, así que
 * todo lo que exporte se publica como endpoint — el guard no puede salir de ahí sin volverse una
 * action más. Si allá cambia la regla, cambia acá.
 */
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

/** El nav del coach vive en el layout: sin esto el menú viejo sobrevive hasta una navegación dura. */
function revalidateCoachShell() {
    revalidatePath('/coach/settings')
    revalidatePath('/coach/dashboard', 'layout')
}

/**
 * Guarda el master switch de los dominios que el coach cambió en el modal.
 *
 * Se escriben de a uno (cada dominio es su propia fila de `coach_feature_prefs`) y un fallo NO
 * cancela los que faltan: el modal deja reintentar, y reintentar manda otra vez el mismo lote —
 * el upsert es idempotente, así que lo ya guardado no se rompe.
 */
export async function savePanelListoDomainsAction(
    input: SavePanelListoInput,
): Promise<SavePanelListoResult> {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Datos inválidos.' }

    const auth = await requireStandaloneCoach()
    if (!auth.ok) return auth

    // Un dominio repetido en el lote gana con su ÚLTIMO valor: dos writes a la misma fila serían
    // idempotentes, pero el conteo que devolvemos dejaría de ser honesto.
    const changes = new Map<FeatureDomain, boolean>()
    for (const change of parsed.data.changes) changes.set(change.domain, change.enabled)

    const supabase = await createClient()
    let saved = 0
    let failed = 0
    for (const [domain, enabled] of changes) {
        const result = await setCoachDomainEnabled(supabase, auth.coachId, domain, enabled)
        if (result.ok) {
            saved += 1
            continue
        }
        failed += 1
        console.error('[panel-listo] no se pudo cambiar el dominio', domain, result.error)
    }

    if (saved > 0) revalidateCoachShell()
    if (failed > 0) {
        return {
            ok: false,
            error: 'No pudimos guardar todos los cambios. Inténtalo de nuevo o cámbialo después en Opciones → Mi panel.',
        }
    }
    return { ok: true, saved }
}
