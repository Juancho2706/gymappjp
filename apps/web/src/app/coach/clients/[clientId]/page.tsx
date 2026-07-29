import { Suspense } from 'react'
import { getClientProfileData } from './_actions/client-detail.actions'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientProfileDashboard } from './ClientProfileDashboard'
import { ClientProfileHero } from './ClientProfileHero'
import {
    getEnabledModulesForRender,
    hasModuleFromMap,
} from '@/services/entitlements-render-cache'
import { applyNutritionAttentionScore } from '@/services/dashboard.service'
import { resolveNutritionTabV2 } from './_data/nutrition-tab-v2.data'

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

    const nutritionClient = client as {
        coach_id?: string | null
        team_id?: string | null
        org_id?: string | null
    }

    // Entitlements de módulos movida por el contexto del RECURSO (team del pool manda; si
    // no, el coach). Enterprise (org_id) fuera en v1. Espejo del gate server-side; se
    // pasan al hero como botones-ícono (gateados), reemplazando la fila de links etiquetados.
    // Poda 2026-07-29: UNA lectura memoizada del mapa en vez de 3 `hasModule` = 3 SELECT
    // idénticos a `coaches`/`teams` por render.
    const isOrgScoped = !!nutritionClient.org_id

    // Módulos (cardio/movimiento/composición) para el hero + el resumen del tab Nutrición
    // (SIEMPRE V2 desde la poda 2026-07-29; ver `_data/nutrition-tab-v2.data.ts`).
    const [enabledModules, nutritionTabV2View] = await Promise.all([
        isOrgScoped
            ? Promise.resolve({})
            : getEnabledModulesForRender(
                  nutritionClient.team_id ?? null,
                  nutritionClient.coach_id ?? null
              ),
        resolveNutritionTabV2(clientId),
    ])
    const cardioModule = hasModuleFromMap(enabledModules, 'cardio')
    const movementModule = hasModuleFromMap(enabledModules, 'movement_assessment')
    const bodycompModule = hasModuleFromMap(enabledModules, 'body_composition')

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

    const coachesRel = (client as { coaches?: { slug?: string } | { slug?: string }[] | null })
        .coaches
    const heroCoachSlug =
        coachesRel == null
            ? undefined
            : Array.isArray(coachesRel)
              ? coachesRel[0]?.slug
              : coachesRel.slug

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
                    is_archived: (client as { is_archived?: boolean | null }).is_archived ?? null,
                }}
                coachSlug={heroCoachSlug}
                compliance={compliance}
                profileLastActivityAt={data.profileLastActivityAt}
                // Score final = base del service (que ya NO mira nutrición) + la señal V2 de esta
                // misma carga. Sin plan V2 vigente no penaliza (rescate §2.2).
                attentionScore={applyNutritionAttentionScore(
                    data.attentionScore,
                    nutritionTabV2View?.isAtRisk ?? null
                )}
                nutritionV2={nutritionTabV2View}
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
                nutritionV2={nutritionTabV2View}
                moduleFlags={{
                    cardio: cardioModule,
                    movement: movementModule,
                    bodycomp: bodycompModule,
                }}
            />
        </div>
    )
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
