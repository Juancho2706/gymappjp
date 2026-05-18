import { Suspense } from 'react'
import { getClientProfileData } from './actions'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientProfileDashboard } from './ClientProfileDashboard'
import { ClientProfileHero } from './ClientProfileHero'

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    
    return (
        <div className="relative mx-auto max-w-[1600px] w-full min-w-0 space-y-8 animate-fade-in">
            <Link href="/coach/clients"
                className="group print:hidden inline-flex max-w-full min-w-0 items-center gap-2 break-words text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground transition-all hover:text-primary">
                <div className="p-1.5 rounded-full bg-secondary dark:bg-white/5 group-hover:bg-primary/10 transition-colors">
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                </div>
                Directorio de Unidades
            </Link>

            <Suspense fallback={<ProfileSkeleton />}>
                <ProfileContent clientId={clientId} />
            </Suspense>
        </div>
    )
}

async function ProfileContent({ clientId }: { clientId: string }) {
    const data = await getClientProfileData(clientId)
    const { client, nutritionPlans, checkIns, compliance } = data

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
            />

            <ClientProfileDashboard data={data} />
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
