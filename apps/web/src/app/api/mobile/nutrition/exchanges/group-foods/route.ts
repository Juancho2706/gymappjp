import { NextRequest, NextResponse } from 'next/server'
import {
    ExcludeExchangeGroupFoodSchema,
    RemoveExchangeGroupFoodSchema,
    UpsertExchangeGroupFoodSchema,
} from '@eva/schemas/nutrition-exchanges'
import { getExchangeGroupsForCoach } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
    excludeExchangeListEntry,
    getExchangeListForGroup,
    restoreExchangeListEntry,
    saveExchangeListEntry,
    searchExchangeListCandidates,
} from '@/services/nutrition-exchanges/exchange-lists.service'
import { gateExchanges } from '../_shared'

/**
 * Listas de equivalencia por grupo (F2) — UNICO camino de escritura para RN
 * (leccion NUT-005: cero escrituras Supabase directas nuevas desde mobile).
 *
 * Espejo exacto de las server actions web (`coach/foods/_actions/exchange-lists.actions.ts`):
 * mismos schemas de `@eva/schemas/nutrition-exchanges` y MISMO servicio, asi que la
 * verificacion de visibilidad de grupo y alimento, el dueno coach-scoped y la resolucion de
 * precedencia son identicos en las dos superficies. Si divergieran, el coach veria una lista
 * en el telefono y otra en el navegador.
 *
 * Gate: `gateExchanges` (Bearer -> coach autoritativo + assertModule server-side). Las
 * escrituras corren con el cliente token-scoped => la RLS de `exchange_group_foods` sigue
 * siendo la segunda capa y el techo real.
 *
 * standalone v1: scope sin team activo, igual que las rutas hermanas.
 */

const MOBILE_SCOPE = { orgId: null, activeTeamId: null } as const

function invalid(messages: string[]) {
    return NextResponse.json({ error: messages.join('. '), code: 'INVALID_PAYLOAD' }, { status: 400 })
}

/**
 * GET: lista resuelta de un grupo (`?groupId=`) y, con `?candidates=1`, los alimentos del
 * catalogo con la sugerencia de gramos ya calculada. La sugerencia se calcula SERVER-SIDE para
 * que RN no tenga que llevar una copia de la formula.
 */
export async function GET(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const url = new URL(request.url)
    const groupId = url.searchParams.get('groupId')
    if (!groupId) return invalid(['Falta el grupo de porciones.'])
    const search = url.searchParams.get('search')
    const wantsCandidates = url.searchParams.get('candidates') === '1'

    if (wantsCandidates) {
        const groups = await getExchangeGroupsForCoach(gate.userClient, gate.coachId, MOBILE_SCOPE)
        const group = groups.find((g) => g.id === groupId)
        if (!group) {
            return NextResponse.json(
                { error: 'Ese grupo de porciones ya no esta disponible.', code: 'GROUP_NOT_FOUND' },
                { status: 404 }
            )
        }
        const candidates = await searchExchangeListCandidates(gate.userClient, {
            groupId: group.id,
            group: {
                refProteinG: group.refProteinG,
                refCarbsG: group.refCarbsG,
                refFatsG: group.refFatsG,
                refCalories: group.refCalories,
            },
            search,
            limit: 40,
        })
        return NextResponse.json({ ok: true, candidates })
    }

    const result = await getExchangeListForGroup(gate.userClient, {
        actorCoachId: gate.coachId,
        scope: MOBILE_SCOPE,
        groupId,
        search,
        limit: 120,
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'GROUP_NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, rows: result.rows, total: result.total })
}

/** POST: alta o edicion de "1 porcion de este grupo = N g de este alimento" en MI lista. */
export async function POST(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = UpsertExchangeGroupFoodSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await saveExchangeListEntry(gate.userClient, {
        actorCoachId: gate.coachId,
        groupId: parsed.data.exchangeGroupId,
        foodId: parsed.data.foodId,
        portionGrams: parsed.data.portionGrams,
        portionLabel: (parsed.data.portionLabel ?? '').trim() || null,
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'LIST_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
}

/**
 * PATCH: lapida — saca el alimento de MI lista sin tocar el catalogo global. Es distinto de
 * DELETE, que borra mi fila y devuelve el alimento al valor del catalogo.
 */
export async function PATCH(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = ExcludeExchangeGroupFoodSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await excludeExchangeListEntry(gate.userClient, {
        actorCoachId: gate.coachId,
        groupId: parsed.data.exchangeGroupId,
        foodId: parsed.data.foodId,
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'LIST_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
}

/** DELETE: borra MI fila (valor propio o lapida) => vuelve a mandar el catalogo global. */
export async function DELETE(request: NextRequest) {
    const gate = await gateExchanges(request)
    if (!gate.ok) return gate.response

    const body = await request.json().catch(() => null)
    const parsed = RemoveExchangeGroupFoodSchema.safeParse(body)
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message))

    const result = await restoreExchangeListEntry(gate.userClient, {
        actorCoachId: gate.coachId,
        groupId: parsed.data.exchangeGroupId,
        foodId: parsed.data.foodId,
    })
    if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'LIST_WRITE_FAILED' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
}
