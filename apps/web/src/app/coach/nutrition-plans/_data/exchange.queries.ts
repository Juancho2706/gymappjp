import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { CoachClientScope } from '@/app/coach/clients/_data/clients.queries'
import { hasModule } from '@/services/entitlements.service'
import {
    getExchangeGroupsForCoach,
    getPlanExchangeEditorData,
    getExchangeEquivalences,
    NUTRITION_EXCHANGES_MODULE,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { resolvePdfBrand } from '@/lib/nutrition-pdf-brand'
import type { PdfBrand } from '@/domain/nutrition/exchange.types'

/**
 * Queries del BUILDER (coach) para el módulo `nutrition_exchanges`.
 * Flujo obligatorio: _data → services → infrastructure/db (nunca Supabase directo
 * para lógica del módulo; acá solo se crea el cliente request-scoped).
 */

/** ¿Módulo ON para el workspace ACTIVO? (la UI espeja; el techo es assertModule en actions). */
export const getHasExchangesModule = cache(async (coachId: string, scope: CoachClientScope) => {
    const supabase = await createClient()
    return hasModule(supabase, NUTRITION_EXCHANGES_MODULE, {
        teamId: scope.activeTeamId,
        coachId,
    })
})

/** Catálogo de grupos por scope 3-vías (system + propios + team activo). */
export const getExchangeGroups = cache(async (coachId: string, scope: CoachClientScope) => {
    const supabase = await createClient()
    return getExchangeGroupsForCoach(supabase, coachId, {
        orgId: scope.orgId,
        activeTeamId: scope.activeTeamId,
    })
})

/** Targets + variantes + modo del plan (round-trip del editor). */
export const getPlanExchangeBundle = cache(async (planId: string) => {
    const supabase = await createClient()
    return getPlanExchangeEditorData(supabase, planId)
})

/** Equivalencias alimento→porción de los grupos dados (RLS de foods = techo). */
export const getExchangeEquivalencesForGroups = cache(async (groupIds: string[]) => {
    const supabase = await createClient()
    return getExchangeEquivalences(supabase, [...groupIds].sort())
})

/**
 * Marca del TENANT para el PDF del coach, resuelta SERVER-SIDE por workspace activo:
 * team ⇒ marca del team (Movida) · enterprise ⇒ marca de la org · standalone ⇒ marca
 * del coach (free tier fuerza EVA). El cliente solo recibe el resultado tipado.
 */
export const getCoachPdfBrand = cache(
    async (coachId: string, scope: CoachClientScope): Promise<{ brand: PdfBrand; logoUrl: string | null }> => {
        const supabase = await createClient()
        if (scope.activeTeamId) {
            const { data: team } = await supabase
                .from('teams')
                .select('id, name, primary_color, logo_url')
                .eq('id', scope.activeTeamId)
                .maybeSingle()
            return {
                brand: resolvePdfBrand({ brandName: team?.name, primaryColor: team?.primary_color }),
                logoUrl: team?.logo_url ?? null,
            }
        }
        if (scope.orgId) {
            const { data: org } = await supabase
                .from('organizations')
                .select('id, name, primary_color, logo_url')
                .eq('id', scope.orgId)
                .maybeSingle()
            return {
                brand: resolvePdfBrand({ brandName: org?.name, primaryColor: org?.primary_color }),
                logoUrl: org?.logo_url ?? null,
            }
        }
        const { data: coach } = await supabase
            .from('coaches')
            .select('id, brand_name, full_name, primary_color, logo_url, subscription_tier')
            .eq('id', coachId)
            .maybeSingle()
        const brand = resolvePdfBrand({
            brandName: coach?.brand_name || coach?.full_name,
            primaryColor: coach?.primary_color,
            subscriptionTier: coach?.subscription_tier,
        })
        return { brand, logoUrl: brand.poweredByEva ? null : (coach?.logo_url ?? null) }
    }
)
