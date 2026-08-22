import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { TEMPLATE_CATALOG } from '@eva/onboarding'
import { PersonaSchema, type Persona } from '@eva/schemas'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { templatesForSurface, type TemplateSurface } from '@/app/coach/_data/onboarding-empty.queries'
import { applyTemplate } from '@/services/onboarding/demo-student.service'
import { resolveTemplateBlueprint } from '@/services/onboarding/templates'
import {
    mobileContextOwnsClient,
    resolveMobileClientMutationContext,
} from '@/app/api/mobile/coach/clients/_mutation-auth'

/**
 * `/api/mobile/coach/templates` — el paso 3 template-first desde la app
 * (SPEC coach-onboarding-v2 §6 y §7, TASKS W8; hallazgo 5 del QA del owner 22-08).
 *
 * La web resuelve el «arma tu primera rutina/pauta» con un vacío template-first y un server action
 * (`applyTemplateAction`). RN no puede llamar a un server action, y el sembrado exige `service_role`
 * (trigger `clients_guard_is_demo` + escritura del inventario del alumno de ejemplo). Este endpoint
 * es el puente: MISMO catálogo (`TEMPLATE_CATALOG`), MISMO filtro por superficie
 * (`templatesForSurface`) y MISMO sembrador (`applyTemplate`) que la web — cero lógica nueva.
 *
 * GET  ?surface=training|nutrition|movement|cardio
 *      → `{ persona, surface, templates: [{ id, label, blurb, kind, days }] }`.
 *        `days` sale del blueprint REAL (días distintos del programa · variantes de día de la
 *        pauta): es lo que la sheet de RN pinta bajo el nombre, y el cliente no puede inventarlo.
 * POST `{ templateId, clientId }` → `{ ok, programId, planId }`.
 *
 * Autorización (la UI NUNCA autoriza), en este orden:
 *  1. sesión real — el GET es lectura pura y verifica el JWT localmente (`verifyMobileBearer`); el
 *     POST es MUTACIÓN y usa `resolveMobileClientMutationContext` (`auth.getUser`, sensible a
 *     revocación) más el workspace validado contra la base;
 *  2. allowlist del catálogo: un `templateId` inventado muere antes de tocar el sembrador;
 *  3. el alumno tiene que ser alcanzable por ESTE coach en su workspace activo
 *     (`mobileContextOwnsClient`, el gemelo móvil de `assertCoachClientReadAccess`).
 *
 * El `coachId` SIEMPRE sale del token; el body solo trae qué plantilla y sobre quién.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

const SURFACES: readonly TemplateSurface[] = ['training', 'nutrition', 'movement', 'cardio']

/** Superficie pedida; cualquier cosa rara cae en entrenamiento (el vacío más común). */
function parseSurface(raw: string | null): TemplateSurface {
    return SURFACES.includes(raw as TemplateSurface) ? (raw as TemplateSurface) : 'training'
}

/** Ids válidos = catálogo puro (misma allowlist que `applyTemplateAction`). */
const KNOWN_TEMPLATE_IDS: ReadonlySet<string> = new Set(
    Object.values(TEMPLATE_CATALOG).flatMap((list) => list.map((template) => template.id)),
)

/**
 * Tamaño de la plantilla leído del CONTENIDO, no de una tabla paralela que se desincroniza: un
 * programa cuenta sus días distintos; una pauta, sus variantes de día. `null` = plantilla del
 * catálogo todavía sin contenido (la sheet simplemente no pinta la línea).
 */
export function templateDays(templateId: string): number | null {
    const blueprint = resolveTemplateBlueprint(templateId)
    if (blueprint == null) return null
    if (blueprint.kind === 'nutrition') {
        return blueprint.plan.dayVariants.length > 0 ? blueprint.plan.dayVariants.length : null
    }
    const days = new Set(blueprint.program.plans.map((plan) => plan.dayOfWeek))
    return days.size > 0 ? days.size : null
}

/** Qué produce la plantilla: un programa o una pauta. `null` = sin contenido todavía. */
export function templateKind(templateId: string): 'program' | 'nutrition' | null {
    return resolveTemplateBlueprint(templateId)?.kind ?? null
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const { data: coach, error } = await admin
        .from('coaches')
        .select('id, persona')
        .eq('id', auth.userId)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' }, { status: 500 })
    }
    if (!coach) {
        return NextResponse.json({ error: 'Coach no encontrado.', code: 'COACH_NOT_FOUND' }, { status: 404 })
    }

    const parsedPersona = PersonaSchema.safeParse(coach.persona)
    const persona: Persona | null = parsedPersona.success ? parsedPersona.data : null
    const surface = parseSurface(new URL(request.url).searchParams.get('surface'))

    const templates = templatesForSurface(surface, persona).map((template) => ({
        id: template.id,
        label: template.label,
        blurb: template.blurb,
        kind: templateKind(template.id),
        days: templateDays(template.id),
    }))

    return NextResponse.json({ persona, surface, templates })
}

const bodySchema = z.object({
    templateId: z.string().trim().min(1).max(64),
    // `z.guid()` y NO `z.uuid()`: hay ids sembrados que no son RFC 4122 y la validación estricta
    // los rechazaría (mismo gotcha que el resto de los endpoints móviles).
    clientId: z.guid(),
})

export async function POST(request: NextRequest) {
    const ctx = await resolveMobileClientMutationContext(request, undefined)
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json({ error: 'Datos inválidos.', code: 'INVALID_TEMPLATE_INPUT' }, { status: 400 })
    }
    const { templateId, clientId } = parsed.data

    if (!KNOWN_TEMPLATE_IDS.has(templateId)) {
        return NextResponse.json({ error: 'Esa plantilla no existe.', code: 'TEMPLATE_UNKNOWN' }, { status: 400 })
    }

    if (!(await mobileContextOwnsClient(ctx, clientId))) {
        return NextResponse.json({ error: 'Ese alumno no es tuyo.', code: 'CLIENT_NOT_ALLOWED' }, { status: 403 })
    }

    const result = await applyTemplate(ctx.admin, { coachId: ctx.userId, clientId, templateId })

    if (!result.ok) {
        if (result.reason === 'template_desconocida') {
            return NextResponse.json({ error: 'Esa plantilla no existe.', code: 'TEMPLATE_UNKNOWN' }, { status: 400 })
        }
        if (result.reason === 'not_implemented') {
            return NextResponse.json(
                { error: 'Plantilla en preparación.', code: 'TEMPLATE_NOT_IMPLEMENTED' },
                { status: 501 },
            )
        }
        return NextResponse.json(
            { error: result.detail ?? 'No se pudo aplicar la plantilla.', code: 'TEMPLATE_APPLY_FAILED' },
            { status: 500 },
        )
    }

    return NextResponse.json({ ok: true, programId: result.programId ?? null, planId: result.planId ?? null })
}
