/**
 * Cálculo PURO del modo intercambios: Σ porciones × macros de referencia del grupo.
 * Sin IO, sin Next.js, sin Supabase — apto para builder (client), PDF y app del alumno.
 *
 * NOTA (PLAN §Archivos): el plan maestro manda este módulo a `packages/calc` (@eva/calc)
 * como primer ocupante. Se implementa acá (contrato del orquestador: services/nutrition-exchanges
 * es propio de este módulo) y la extracción al package es un move 1:1 sin cambios de API.
 */

import type {
    ComposedGroupPart,
    ExchangeGroup,
    ExchangeMacroTotals,
    MealExchangeTarget,
} from '@/domain/nutrition/exchange.types'

const ZERO: ExchangeMacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }

function round1(n: number): number {
    return Math.round(n * 10) / 10
}

function roundTotals(t: ExchangeMacroTotals): ExchangeMacroTotals {
    return {
        calories: round1(t.calories),
        proteinG: round1(t.proteinG),
        carbsG: round1(t.carbsG),
        fatsG: round1(t.fatsG),
    }
}

function byId(groups: ExchangeGroup[]): Map<string, ExchangeGroup> {
    return new Map(groups.map((g) => [g.id, g]))
}

/** Resuelve un código de grupo base (para composed_of) priorizando grupos system. */
function findByCode(groups: ExchangeGroup[], code: string): ExchangeGroup | undefined {
    const candidates = groups.filter((g) => g.code === code)
    return candidates.find((g) => g.isSystem) ?? candidates[0]
}

export type EffectiveTarget = {
    /** Grupo efectivo tras expandir compuestos (LEG ⇒ filas P y C). */
    group: ExchangeGroup
    portions: number
    /** Grupo original prescrito (igual a `group` si no hubo expansión). */
    sourceGroup: ExchangeGroup
}

/**
 * Expande grupos compuestos: una porción de LEG (`composed_of: [{code:'P',portions:1},{code:'C',portions:1}]`)
 * se convierte en 1P + 1C por porción prescrita. Si un código no resuelve contra `groups`,
 * el grupo compuesto se conserva tal cual (usa sus propios `ref_*` como fallback).
 * Targets de grupos desconocidos (id no presente en `groups`) se omiten.
 */
export function expandComposedGroups(
    targets: Pick<MealExchangeTarget, 'exchangeGroupId' | 'portions'>[],
    groups: ExchangeGroup[]
): EffectiveTarget[] {
    const map = byId(groups)
    const out: EffectiveTarget[] = []
    for (const t of targets) {
        const group = map.get(t.exchangeGroupId)
        if (!group || !(t.portions > 0)) continue
        const parts = (group.composedOf ?? []) as ComposedGroupPart[]
        if (parts.length === 0) {
            out.push({ group, portions: t.portions, sourceGroup: group })
            continue
        }
        const resolved = parts.map((p) => ({ part: p, base: findByCode(groups, p.code) }))
        if (resolved.some((r) => !r.base)) {
            // Fallback honesto: el compuesto no expande si falta un grupo base.
            out.push({ group, portions: t.portions, sourceGroup: group })
            continue
        }
        for (const { part, base } of resolved) {
            out.push({ group: base!, portions: round1(part.portions * t.portions), sourceGroup: group })
        }
    }
    return out
}

/** Macros derivados de una lista de targets (con expansión de compuestos). Redondeo a 1 decimal. */
export function macrosForTargets(
    targets: Pick<MealExchangeTarget, 'exchangeGroupId' | 'portions'>[],
    groups: ExchangeGroup[]
): ExchangeMacroTotals {
    const expanded = expandComposedGroups(targets, groups)
    const acc = expanded.reduce<ExchangeMacroTotals>(
        (sum, { group, portions }) => ({
            calories: sum.calories + group.refCalories * portions,
            proteinG: sum.proteinG + group.refProteinG * portions,
            carbsG: sum.carbsG + group.refCarbsG * portions,
            fatsG: sum.fatsG + group.refFatsG * portions,
        }),
        { ...ZERO }
    )
    return roundTotals(acc)
}

export type MealTargetsLike = {
    targets: Pick<MealExchangeTarget, 'exchangeGroupId' | 'portions'>[]
    /** null/undefined = la comida aplica a TODAS las variantes. */
    dayVariantId?: string | null
}

/** Totales del día sumando todas las comidas (sin distinción de variantes). */
export function dayTotals(meals: MealTargetsLike[], groups: ExchangeGroup[]): ExchangeMacroTotals {
    const acc = meals.reduce<ExchangeMacroTotals>((sum, meal) => {
        const m = macrosForTargets(meal.targets, groups)
        return {
            calories: sum.calories + m.calories,
            proteinG: sum.proteinG + m.proteinG,
            carbsG: sum.carbsG + m.carbsG,
            fatsG: sum.fatsG + m.fatsG,
        }
    }, { ...ZERO })
    return roundTotals(acc)
}

/**
 * Totales por variante de día. Comidas con `dayVariantId` null cuentan en TODAS las
 * variantes (contrato DB: NULL = aplica a todas). Sin variantes ⇒ una sola entrada `null`.
 */
export function dayTotalsByVariant(
    meals: MealTargetsLike[],
    variants: { id: string; name: string }[],
    groups: ExchangeGroup[]
): { variantId: string | null; name: string | null; totals: ExchangeMacroTotals }[] {
    if (variants.length === 0) {
        return [{ variantId: null, name: null, totals: dayTotals(meals, groups) }]
    }
    return variants.map((v) => ({
        variantId: v.id,
        name: v.name,
        totals: dayTotals(
            meals.filter((m) => m.dayVariantId == null || m.dayVariantId === v.id),
            groups
        ),
    }))
}

/** Render compacto de una fracción de porciones: 1 ⇒ '1', 0.5 ⇒ '0.5', 1.5 ⇒ '1.5'. */
export function formatPortions(portions: number): string {
    const r = round1(portions)
    return Number.isInteger(r) ? String(r) : String(r)
}

/**
 * Código resumen de la comida: "2C · 1LAC · 1F" (orden por `sortOrder` del grupo,
 * desempate por código). SIN expansión de compuestos: la nutri prescribe "1LEG".
 */
export function portionsSummaryLabel(
    targets: Pick<MealExchangeTarget, 'exchangeGroupId' | 'portions'>[],
    groups: ExchangeGroup[]
): string {
    const map = byId(groups)
    const rows = targets
        .map((t) => ({ group: map.get(t.exchangeGroupId), portions: t.portions }))
        .filter((r): r is { group: ExchangeGroup; portions: number } => !!r.group && r.portions > 0)
        .sort((a, b) =>
            a.group.sortOrder !== b.group.sortOrder
                ? a.group.sortOrder - b.group.sortOrder
                : a.group.code.localeCompare(b.group.code)
        )
    return rows.map((r) => `${formatPortions(r.portions)}${r.group.code}`).join(' · ')
}

/** ¿Algún grupo usado tiene macros sin confirmar? (badge "referencial", AC3). */
export function hasUnconfirmedMacros(
    targets: Pick<MealExchangeTarget, 'exchangeGroupId' | 'portions'>[],
    groups: ExchangeGroup[]
): boolean {
    const map = byId(groups)
    return targets.some((t) => {
        const g = map.get(t.exchangeGroupId)
        return !!g && !g.macrosConfirmed
    })
}

/** Paleta fallback para grupos sin `color` (determinística por sortOrder). Dark-mode friendly. */
export const EXCHANGE_FALLBACK_COLORS = [
    '#F59E0B', // amber
    '#3B82F6', // blue
    '#EF4444', // red
    '#22C55E', // green
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
] as const

export function exchangeGroupColor(group: Pick<ExchangeGroup, 'color' | 'sortOrder'>): string {
    if (group.color && /^#[0-9a-fA-F]{6}$/.test(group.color)) return group.color
    const idx = Math.abs(Math.trunc(group.sortOrder)) % EXCHANGE_FALLBACK_COLORS.length
    return EXCHANGE_FALLBACK_COLORS[idx]
}
