import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DashboardContent } from './_components/DashboardContent'
import { getCoach } from '@/lib/coach/get-coach'
import { CoachLoadingShell } from '@/components/ui/EvaRouteLoader'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function CoachDashboardPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    return (
        <Suspense fallback={<CoachLoadingShell />}>
            <DashboardContent userId={coach.id} coachName={coach.full_name ?? coach.brand_name ?? 'Coach'} />
        </Suspense>
    )
}
