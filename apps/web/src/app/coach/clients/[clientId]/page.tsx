import { Suspense } from 'react'
import { getClientProfileData } from './_actions/client-detail.actions'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientProfileDashboard } from './ClientProfileDashboard'
import { ClientProfileHero } from './ClientProfileHero'
import { createClient } from '@/lib/supabase/server'
import { hasModule } from '@/services/entitlements.service'
import {
    resolveClientFeaturePrefsOverrideContext,
    resolveFeaturePrefs,
    resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'
import { getCoachNutrientTargets } from './_data/nutrient-targets.queries'
import { getCoachPrivateNotes, getCoachMealComments } from './_data/nutrition-notes.queries'

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    
    return (
        <div className="relative mx-auto max-w-[1600px] w-full min-w-0 space-y-8 animate-fade-in">
            <div className="flex items-center justify-between print:hidden">
                <Link href="/coach/clients"
                    className="group inline-flex max-w-full min-w-0 items-center gap-2 break-words text-[10px] font-black uppercase tracking-widest text-muted transition-all hover:text-sport-600">
                    <div className="rounded-control bg-surface-sunken p-1.5 transition-colors group-hover:bg-sport-100">
                        <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
                    </div>
                    Alumnos
                </Link>
            </div>

            <Suspense fallback={<ProfileSkeleton />}>
                <ProfileContent clientId={clientId} />
            </Suspense>
        </div>
    )
}

async function ProfileContent({ clientId }: { clientId: string }) {
    const data = await getClientProfileData(clientId)
    const { client, nutritionPlans, checkIns, compliance } = data

    // Zona C (coach) de Nutrición: umbrales de micros, nota privada y el hilo
    // bidireccional de comentarios (anclado al día de hoy en Santiago). Se
    // resuelven server-side y se pasan al dashboard → NutritionTabB5.
    const nutritionTodayIso = (data.todayIso as string | undefined) ?? ''

    // Prefs RESUELTAS para ESTE alumno: el coach debe ver lo que ve el alumno
    // (base coach/team + override del cliente). El resolver gobierna que zonas
    // opcionales se muestran; las core (plan/macros/adherencia) van siempre.
    // El contexto (coach/team/org/plan) sale de la fila del alumno + plan activo
    // para que entitlement (pool-wins + kill-switch) + preferencia coincidan con
    // la vista del alumno.
    const nutritionClient = client as {
        coach_id?: string | null
        team_id?: string | null
        org_id?: string | null
    }
    const nutritionCoachId = nutritionClient.coach_id ?? ''
    const activeNutritionPlanId =
        (data.activeNutritionPlanWithMeals as { id?: string } | null | undefined)?.id ?? null
    const featurePrefsInput = {
        coachId: nutritionCoachId,
        clientId,
        clientTeamId: nutritionClient.team_id ?? null,
        clientOrgId: nutritionClient.org_id ?? null,
    }

    // Entitlements de módulos movida por el contexto del RECURSO (team del pool manda; si
    // no, el coach). Enterprise (org_id) fuera en v1. Espejo del gate server-side; se
    // pasan al hero como botones-ícono (gateados), reemplazando la fila de links etiquetados.
    const moduleSupabase = await createClient()
    const isOrgScoped = !!nutritionClient.org_id
    const moduleCtx = nutritionClient.team_id
        ? { teamId: nutritionClient.team_id }
        : { coachId: nutritionClient.coach_id ?? '' }

    const [
        coachNutrientTargets,
        coachPrivateNotes,
        coachMealComments,
        nutritionProEnabled,
        nutritionDomainEnabled,
        nutritionSectionFlags,
        nutritionOverrideContext,
        cardioModule,
        movementModule,
        bodycompModule,
    ] = await Promise.all([
        getCoachNutrientTargets(clientId),
        getCoachPrivateNotes(clientId),
        nutritionTodayIso
            ? getCoachMealComments(clientId, nutritionTodayIso)
            : Promise.resolve([]),
        resolveNutritionProEnabled(clientId),
        resolveNutritionDomainEnabled(featurePrefsInput),
        resolveFeaturePrefs({
            domain: 'nutrition',
            ...featurePrefsInput,
            planId: activeNutritionPlanId,
        }),
        // Override por-alumno (tri-state heredar/mostrar/ocultar) que renderiza el panel
        // "Funciones para este alumno" en la Zona C de la ficha. baseEffective = lo que se
        // hereda del default coach/team; override = lo ya forzado para este alumno.
        resolveClientFeaturePrefsOverrideContext({
            domain: 'nutrition',
            ...featurePrefsInput,
            planId: activeNutritionPlanId,
        }),
        isOrgScoped ? Promise.resolve(false) : hasModule(moduleSupabase, 'cardio', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(moduleSupabase, 'movement_assessment', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(moduleSupabase, 'body_composition', moduleCtx),
    ])

    const sortedCheckIns = [...(checkIns || [])].sort(
        (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastCheckIn = sortedCheckIns[0]
    const prevCheckIn = sortedCheckIns[1]
    const intake = (client as { client_intake?: { weight_kg?: number } }).client_intake
    const currentWeightKg = lastCheckIn?.weight ?? intake?.weight_kg ?? 0
    const weightDeltaKg =
        lastCheckIn && prevCheckIn && lastCheckIn.weight != null && prevCheckIn.weight != null
            ? Number((lastCheckIn.weight - prevCheckIn.weight).toFixed(2))
            : 0

    const firstPlan = nutritionPlans[0]

    return (
        <div id="coach-client-profile-print" className="space-y-8 print:space-y-4">
            <ClientProfileHero
                clientId={clientId}
                client={{
                    full_name: client.full_name,
                    email: client.email,
                    phone: client.phone,
                    subscription_start_date: client.subscription_start_date,
                    created_at: client.created_at,
                    is_active: client.is_active,
                }}
                compliance={compliance}
                profileLastActivityAt={data.profileLastActivityAt}
                attentionScore={data.attentionScore}
                currentWeightKg={typeof currentWeightKg === 'number' ? currentWeightKg : 0}
                weightDeltaKg={weightDeltaKg}
                nutritionPlansLength={nutritionPlans.length}
                nutritionFirstPlanId={firstPlan?.id}
                activeProgramName={
                    (data.activeProgram as { name?: string | null } | null | undefined)?.name ?? null
                }
                moduleFlags={{
                    cardio: cardioModule,
                    movement: movementModule,
                    bodycomp: bodycompModule,
                }}
            />

            <ClientProfileDashboard
                data={data}
                coachNutrientTargets={coachNutrientTargets}
                coachPrivateNotes={coachPrivateNotes}
                coachMealComments={coachMealComments}
                nutritionProEnabled={nutritionProEnabled}
                nutritionDomainEnabled={nutritionDomainEnabled}
                nutritionSectionFlags={nutritionSectionFlags}
                nutritionOverrideContext={nutritionOverrideContext}
                moduleFlags={{
                    cardio: cardioModule,
                    movement: movementModule,
                    bodycomp: bodycompModule,
                }}
            />
        </div>
    )
}

/**
 * ¿"Nutrición Pro" (módulo nutrition_exchanges) ON para el contexto del recurso de
 * este alumno? Gobierna los micros AVANZADOS del editor de umbrales (Zona C). Gate
 * server-side por contexto del RECURSO (team del pool manda; si no, el coach). Espejo
 * visual; el gate real de escritura sigue siendo server-side. Fail-closed.
 */
async function resolveNutritionProEnabled(clientId: string): Promise<boolean> {
    const supabase = await createClient()
    const { data: row } = await supabase
        .from('clients')
        .select('team_id, org_id, coach_id')
        .eq('id', clientId)
        .maybeSingle()
    if (!row || row.org_id) return false
    const ctx = row.team_id ? { teamId: row.team_id } : { coachId: row.coach_id }
    return hasModule(supabase, 'nutrition_exchanges', ctx)
}

function ProfileSkeleton() {
    return (
        <div className="space-y-8">
            <div className="flex items-center gap-6">
                <Skeleton className="w-24 h-24 rounded-2xl" />
                <div className="space-y-3">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>
            <Skeleton className="h-8 w-full max-w-md" />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <Skeleton className="h-64 md:col-span-8 rounded-xl" />
                <Skeleton className="h-64 md:col-span-4 rounded-xl" />
            </div>
        </div>
    )
}
