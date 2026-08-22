'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { assertCoachClientReadAccess } from '@/services/client/client-scope.service'
import { applyTemplate } from '@/services/onboarding/demo-student.service'
import { TEMPLATE_CATALOG } from '@eva/onboarding'

/**
 * Aplica una plantilla del catálogo del onboarding v2 a un alumno del coach
 * (docs/specs/coach-onboarding-v2/SPEC.md §7, TASKS F3.3/F3.6).
 *
 * Boundary de mutación: la UI NUNCA autoriza. Acá se valida, en este orden,
 *  1. sesión real (`getUser`, no el body),
 *  2. que el `templateId` exista en `TEMPLATE_CATALOG` (Zod + allowlist),
 *  3. que el alumno sea alcanzable por ESTE coach en su workspace activo
 *     (`assertCoachClientReadAccess`: standalone propio, pool del team o enterprise).
 *
 * El sembrado real lo hace `applyTemplate` (W3 F3.1) con el cliente ADMIN, porque el contenido
 * del alumno de ejemplo lo escribe `service_role` (trigger `clients_guard_is_demo`). El cliente
 * de servicio se crea DESPUÉS de los tres chequeos y nunca sale de este módulo.
 *
 * Mientras W3-A no lo implemente, el stub responde `not_implemented` y la UI lo muestra como
 * «Plantilla en preparación»: el vacío template-first no se rompe.
 */
const ApplyTemplateInputSchema = z.object({
    templateId: z.string().trim().min(1).max(64),
    // `z.guid()` y NO `z.uuid()`: hay ids sembrados que no son RFC 4122 y una validación
    // estricta los rechazaría (gotcha documentado en la suite de endpoints mobile).
    clientId: z.guid(),
})

/** Ids válidos = catálogo puro. Un id inventado nunca llega al sembrador. */
const KNOWN_TEMPLATE_IDS: ReadonlySet<string> = new Set(
    Object.values(TEMPLATE_CATALOG).flatMap((list) => list.map((template) => template.id)),
)

export async function applyTemplateAction(input: { templateId: string; clientId: string }) {
    const parsed = ApplyTemplateInputSchema.safeParse(input)
    if (!parsed.success) {
        return { ok: false as const, reason: 'template_desconocida' as const, error: 'Datos inválidos.' }
    }
    const { templateId, clientId } = parsed.data

    if (!KNOWN_TEMPLATE_IDS.has(templateId)) {
        return {
            ok: false as const,
            reason: 'template_desconocida' as const,
            error: 'Esa plantilla no existe.',
        }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false as const, reason: 'no_autenticado' as const, error: 'Inicia sesión de nuevo.' }
    }

    try {
        await assertCoachClientReadAccess(supabase, user.id, clientId)
    } catch {
        return {
            ok: false as const,
            reason: 'sin_acceso' as const,
            error: 'Ese alumno no es tuyo.',
        }
    }

    const result = await applyTemplate(createServiceRoleClient(), {
        coachId: user.id,
        clientId,
        templateId,
    })

    if (!result.ok) {
        if (result.reason === 'not_implemented') {
            return {
                ok: false as const,
                reason: 'not_implemented' as const,
                error: 'Plantilla en preparación.',
            }
        }
        return {
            ok: false as const,
            reason: 'error' as const,
            error: result.detail ?? 'No se pudo aplicar la plantilla.',
        }
    }

    revalidatePath('/coach/workout-programs')
    revalidatePath('/coach/nutrition-v2')
    revalidatePath(`/coach/clients/${clientId}`)
    return { ok: true as const, programId: result.programId, planId: result.planId }
}
