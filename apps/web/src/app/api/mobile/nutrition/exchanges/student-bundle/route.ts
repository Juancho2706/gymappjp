import { NextRequest, NextResponse } from 'next/server'
import { getStudentExchangeBundle } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
    exchangeGroupColor,
    formatPortions,
    hasUnconfirmedMacros,
    macrosForTargets,
} from '@/services/nutrition-exchanges/exchange-calc'
import type { ExchangeGroup, MealExchangeTarget } from '@/domain/nutrition/exchange.types'
import { authNutritionClient, resolveClientNutritionContext } from '../../_shared'

/**
 * GET /api/mobile/nutrition/exchanges/student-bundle
 *
 * Bundle del modo intercambios ("Nutricion Pro" por-alumno, modulo `nutrition_exchanges`) para
 * la app del ALUMNO. Es el ESPEJO read-only del `getStudentExchangeData` de la web
 * (page.tsx:92 → NutritionShell chips/equivalencias/derivados) — el mobile no lo consumia.
 *
 * Por que un endpoint y no PostgREST directo: el alumno NO tiene policy `xg_select` sobre el
 * catalogo `exchange_groups` de su coach/team (solo `is_system`), asi que no puede resolver los
 * grupos referenciados por su plan por RLS. La web lo resuelve con service-role acotado; aca se
 * reusa EXACTAMENTE el mismo servicio (`getStudentExchangeBundle`), con `admin` filtrado por el
 * `clientId`/`planId` verificados del Bearer (resultado identico a la sesion-cookie del alumno).
 *
 * MONEY-SAFETY (fail-CLOSED, identico a web): `getStudentExchangeBundle` corre
 * `hasExchangesModuleForClientContext` (pool manda) ANTES de serializar nada; modulo OFF o plan
 * en modo gramos ⇒ `enabled:false` y CERO dato de intercambios en el JSON. El gate NO es solo UI.
 *
 * El calculo (chips, macros derivados por comida, badge "referencial") se hace AQUI reusando el
 * motor puro `exchange-calc` (unica fuente de verdad, compartida con el builder web y el PDF), de
 * modo que el cliente RN es 100% presentacional y no duplica ni una linea de logica de negocio.
 */

type ChipView = { groupId: string; code: string; color: string; portions: number; portionsLabel: string }
type MealView = {
    mealId: string
    variantName: string | null
    derived: { calories: number; proteinG: number; carbsG: number; fatsG: number } | null
    hasUnconfirmed: boolean
    chips: ChipView[]
}

/**
 * Chips render-ready de UNA comida — MISMO orden y forma que el `ExchangeMealChips` de web
 * (sortOrder del grupo, desempate por codigo; solo porciones > 0).
 */
function buildChips(targets: MealExchangeTarget[], groups: ExchangeGroup[]): ChipView[] {
    const byId = new Map(groups.map((g) => [g.id, g]))
    return targets
        .map((t) => ({ group: byId.get(t.exchangeGroupId), portions: t.portions }))
        .filter((r): r is { group: ExchangeGroup; portions: number } => !!r.group && r.portions > 0)
        .sort((a, b) =>
            a.group.sortOrder !== b.group.sortOrder
                ? a.group.sortOrder - b.group.sortOrder
                : a.group.code.localeCompare(b.group.code),
        )
        .map((r) => ({
            groupId: r.group.id,
            code: r.group.code,
            color: exchangeGroupColor(r.group),
            portions: r.portions,
            portionsLabel: formatPortions(r.portions),
        }))
}

export async function GET(request: NextRequest) {
    const auth = await authNutritionClient(request)
    if (!auth.ok) return auth.response
    const { clientId, admin } = auth

    const ctx = await resolveClientNutritionContext(admin, clientId)
    if (!ctx) {
        return NextResponse.json({
            hasPlan: false,
            enabled: false,
            planMode: 'grams',
            meals: [],
            groups: [],
            equivalences: [],
        })
    }

    // El modo del plan (gramos <-> intercambios) lo fija el coach; se lee autoritativo server-side.
    const { data: planRow } = await admin
        .from('nutrition_plans')
        .select('plan_mode')
        .eq('id', ctx.planId)
        .maybeSingle()
    const planMode = ((planRow as { plan_mode?: string | null } | null)?.plan_mode ?? 'grams') as
        | 'grams'
        | 'exchanges'

    // Fail-CLOSED por modulo/contexto (dentro del servicio). Modo gramos ⇒ EMPTY_BUNDLE.
    const bundle = await getStudentExchangeBundle(admin, admin, {
        planId: ctx.planId,
        planCoachId: ctx.coachId,
        planMode,
        clientId,
    })

    if (!bundle.enabled) {
        return NextResponse.json({
            hasPlan: true,
            enabled: false,
            planMode,
            meals: [],
            groups: [],
            equivalences: [],
        })
    }

    const variantNameById = new Map(bundle.variants.map((v) => [v.id, v.name]))

    const meals: MealView[] = Object.entries(bundle.targetsByMealId)
        .map(([mealId, targets]) => {
            const derived = macrosForTargets(targets, bundle.groups)
            const variantId = bundle.variantByMealId[mealId] ?? null
            return {
                mealId,
                variantName: variantId ? (variantNameById.get(variantId) ?? null) : null,
                derived: {
                    calories: derived.calories,
                    proteinG: derived.proteinG,
                    carbsG: derived.carbsG,
                    fatsG: derived.fatsG,
                },
                hasUnconfirmed: hasUnconfirmedMacros(targets, bundle.groups),
                chips: buildChips(targets, bundle.groups),
            }
        })
        .filter((m) => m.chips.length > 0)

    return NextResponse.json({
        hasPlan: true,
        enabled: true,
        planMode: 'exchanges' as const,
        meals,
        groups: bundle.groups.map((g) => ({
            id: g.id,
            code: g.code,
            name: g.name,
            color: exchangeGroupColor(g),
            refCalories: g.refCalories,
            refProteinG: g.refProteinG,
            refCarbsG: g.refCarbsG,
            refFatsG: g.refFatsG,
            macrosConfirmed: g.macrosConfirmed,
        })),
        equivalences: bundle.equivalences.map((e) => ({
            foodId: e.foodId,
            name: e.name,
            exchangeGroupId: e.exchangeGroupId,
            portionGrams: e.portionGrams,
            portionLabel: e.portionLabel,
        })),
    })
}
