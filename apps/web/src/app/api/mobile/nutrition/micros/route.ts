import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    getPlanDayMicros,
    getMicroTargetsForClient,
} from '@/app/c/[coach_slug]/nutrition/_data/sections.queries'
import {
    resolveFeaturePrefs,
    resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'
import { authNutritionClient, resolveClientNutritionContext } from '../_shared'

/**
 * GET /api/mobile/nutrition/micros?date=YYYY-MM-DD
 *
 * Micros del plan del alumno para un dia. Espejo EXACTO del `MicrosPanel` de web:
 *  - `micros_base` (sodio + fibra): gratis; visible salvo que el coach lo apague.
 *  - `micros_advanced` (azucar + grasas): GATEADO por el modulo `nutrition_exchanges`
 *    ("Nutricion Pro"). El gate vive server-side en `resolveFeaturePrefs` (entitlement
 *    fail-closed) — identico a web (`sectionFlags.micros_advanced`). Los datos avanzados
 *    NUNCA se serializan si la seccion no esta habilitada (money-safety: sin fuga de dato pago).
 *
 * Numeros identicos a web: reusa `getPlanDayMicros` (motor `sumMealMicros`) y
 * `getMicroTargetsForClient`, inyectando el cliente service-role filtrado por el `clientId`
 * verificado del Bearer.
 */

const QuerySchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe ser YYYY-MM-DD')
        .optional(),
})

export async function GET(request: NextRequest) {
    const auth = await authNutritionClient(request)
    if (!auth.ok) return auth.response
    const { clientId, admin } = auth

    const parsed = QuerySchema.safeParse({
        date: request.nextUrl.searchParams.get('date') ?? undefined,
    })
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues.map((i) => i.message).join('. '), code: 'BAD_REQUEST' },
            { status: 400 },
        )
    }
    const date = parsed.data.date ?? getTodayInSantiago().iso

    const ctx = await resolveClientNutritionContext(admin, clientId)
    if (!ctx) {
        return NextResponse.json({ hasPlan: false, domainEnabled: true, date })
    }

    // Master switch del dominio (fail-OPEN con flag OFF, igual que web): si esta apagado por el
    // coach, el alumno no ve nada de nutricion -> el cliente movil oculta la seccion.
    const domainEnabled = await resolveNutritionDomainEnabled(
        {
            coachId: ctx.coachId ?? '',
            clientId,
            clientTeamId: ctx.teamId,
            clientOrgId: ctx.orgId,
        },
        admin,
    )
    if (!domainEnabled) {
        return NextResponse.json({ hasPlan: true, domainEnabled: false, date })
    }

    const [flags, dayMicros, targets] = await Promise.all([
        resolveFeaturePrefs(
            {
                domain: 'nutrition',
                coachId: ctx.coachId ?? '',
                clientId,
                planId: ctx.planId,
                clientTeamId: ctx.teamId,
                clientOrgId: ctx.orgId,
            },
            admin,
        ),
        getPlanDayMicros(clientId, ctx.planId, date, admin),
        getMicroTargetsForClient(ctx.coachId, clientId, admin),
    ])

    const microsBase = flags.micros_base === true
    const microsAdvanced = flags.micros_advanced === true

    return NextResponse.json({
        hasPlan: true,
        domainEnabled: true,
        date,
        sections: { microsBase, microsAdvanced },
        base: {
            sodiumMg: dayMicros.sodiumMg,
            fiberG: dayMicros.fiberG,
            sodiumTarget: targets.sodium ?? null,
            fiberTarget: targets.fiber ?? null,
        },
        // Money-safety: los micros AVANZADOS (pago) solo se serializan si el gate lo permite.
        advanced: microsAdvanced
            ? {
                  sugarG: dayMicros.sugarG,
                  saturatedFatG: dayMicros.saturatedFatG,
                  unsaturatedFatG: dayMicros.unsaturatedFatG,
                  sugarTarget: targets.sugar ?? null,
                  saturatedFatTarget: targets.saturatedFat ?? null,
                  unsaturatedFatTarget: targets.unsaturatedFat ?? null,
              }
            : null,
    })
}
