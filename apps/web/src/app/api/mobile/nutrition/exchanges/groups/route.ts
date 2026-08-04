import { NextRequest, NextResponse } from 'next/server'
import {
    CreateExchangeGroupSchema,
    DeleteExchangeGroupSchema,
    DuplicateExchangeGroupSchema,
    UpdateExchangeGroupSchema,
} from '@eva/schemas/nutrition-exchanges'
import {
    createCoachExchangeGroup,
    deleteCoachExchangeGroup,
    updateCoachExchangeGroup,
    type ExchangeGroupInput,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { duplicateExchangeGroupWithList } from '@/services/nutrition-exchanges/exchange-lists.service'
import { gateExchanges } from '../_shared'

/**
 * Grupos de porciones PROPIOS del coach — UNICO camino de escritura para RN
 * (leccion NUT-005: cero escrituras Supabase directas nuevas desde mobile).
 * Espejo exacto de las server actions web (`_actions/exchange-groups.actions.ts`): mismo
 * schema (`@eva/schemas/nutrition-exchanges`) y mismo servicio, asi que la unicidad de
 * code/slug, el cap de grupos propios y el `macros_confirmed = false` forzado son
 * identicos en las dos superficies.
 *
 * Gate: `gateExchanges` (Bearer -> coach autoritativo via service-role SOLO para
 * `auth.getUser`, + assertModule server-side). Las escrituras corren con el cliente
 * token-scoped => la RLS `xg_insert/update/delete` sigue siendo la 2da capa.
 *
 * standalone v1: scope sin team activo (igual que el resto de las rutas hermanas), asi que
 * el grupo nace coach-scoped y el catalogo visible es system + propios.
 */

const MOBILE_SCOPE = { orgId: null, activeTeamId: null } as const

function invalid(messages: string[]) {
    return NextResponse.json({ error: messages.join('. '), code: 'INVALID_PAYLOAD' }, { status: 400 })
}

function valuesOf(parsed: {
    name: string
    code: string
    slug?: string
    refCalories: number
    refProteinG: number
    refCarbsG: number
    refFatsG: number
    color?: string | null
}): ExchangeGroupInput {
    return {
        name: parsed.name,
        code: parsed.code,
        slug: parsed.slug ?? null,
        refCalories: parsed.refCalories,
        refProteinG: parsed.refProteinG,
        refCarbsG: parsed.refCarbsG,
        refFatsG: parsed.refFatsG,
        color: parsed.color ?? null,
    }
}

export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = CreateExchangeGroupSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await createCoachExchangeGroup(gate.userClient, {
        actorCoachId: gate.coachId,
        scope: MOBILE_SCOPE,
        values: valuesOf(parsed.data),
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'GROUP_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, group: result.group })
}

export async function PATCH(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = UpdateExchangeGroupSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await updateCoachExchangeGroup(gate.userClient, {
        actorCoachId: gate.coachId,
        scope: MOBILE_SCOPE,
        groupId: parsed.data.groupId,
        values: valuesOf(parsed.data),
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'GROUP_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, group: result.group })
}

/**
 * "Duplicar y ajustar" CON copia de la lista (paridad de T4.3 web). Verbo PUT porque POST ya
 * es el alta desde cero: duplicar crea un grupo pero su entrada, su payload y su resultado son
 * otros (trae `sourceGroupId` y devuelve cuantas equivalencias se copiaron).
 *
 * Mismo schema y mismo servicio que la server action web (`duplicateExchangeGroupAction`), asi
 * que el reescalado por regla de tres, el tope de filas y la unicidad de codigo/slug salen
 * identicos en las dos superficies. El reescalado vive SIEMPRE server-side: el telefono jamas
 * lleva una copia de la formula.
 *
 * Falla PARCIAL: si el grupo se creo pero la copia de la lista fallo, la respuesta sigue siendo
 * 200 con `copyError` — deshacer el grupo dejaria al coach sin lo que si pidio (mismo criterio
 * que el servicio). La UI lo distingue con el toast `copyFailed`.
 */
export async function PUT(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = DuplicateExchangeGroupSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await duplicateExchangeGroupWithList(gate.userClient, {
        actorCoachId: gate.coachId,
        scope: MOBILE_SCOPE,
        sourceGroupId: parsed.data.sourceGroupId,
        values: valuesOf(parsed.data),
        copyList: parsed.data.copyList,
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'GROUP_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({
        ok: true,
        group: result.group,
        copied: result.copied,
        attempted: result.attempted,
        ...(result.copyError ? { copyError: result.copyError } : {}),
    })
}

export async function DELETE(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = DeleteExchangeGroupSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await deleteCoachExchangeGroup(gate.userClient, {
        actorCoachId: gate.coachId,
        scope: MOBILE_SCOPE,
        groupId: parsed.data.groupId,
    })
    if (!result.success) {
        return NextResponse.json(
            { error: result.error ?? 'No se pudo eliminar el grupo.', code: 'GROUP_WRITE_FAILED' },
            { status: 400 }
        )
    }
    return NextResponse.json({ ok: true, groupId: parsed.data.groupId })
}
