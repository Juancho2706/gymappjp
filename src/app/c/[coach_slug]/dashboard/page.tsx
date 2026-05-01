import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'

import { DashboardShell } from './_components/DashboardShell'
import { DashboardPullToRefresh } from './_components/DashboardPullToRefresh'
import { DashboardHeader } from './_components/DashboardHeader'
import { WeekCalendar } from './_components/calendar/WeekCalendar'
import { CheckInBanner } from './_components/checkin/CheckInBanner'
import { HeroAndComplianceGroup } from './_components/HeroAndComplianceGroup'
import { ActiveProgramSection } from './_components/program/ActiveProgramSection'
import { RecentWorkoutsSection } from './_components/history/RecentWorkoutsSection'
import { WeightFullChartSection } from './_components/WeightFullChartSection'
import { DashboardSidebarBlocks } from './_components/DashboardSidebarBlocks'
import { WelcomeModal } from './_components/WelcomeModal'
import { getClientProfile } from './_data/dashboard.queries'
import {
    DashboardHeaderSkeleton,
    CalendarSkeleton,
    CheckInSkeleton,
    HeroAndComplianceSkeleton,
    ProgramSkeleton,
    HistorySkeleton,
    WeightChartSkeleton,
} from './_components/dashboard-skeletons'

export const metadata: Metadata = { title: 'Dashboard' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientDashboardPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    const { client } = await getClientProfile(user.id)
    if (!client) redirect(`/c/${coach_slug}/login`)

    const coachRow = client.coaches
    const coachBranding = Array.isArray(coachRow) ? coachRow[0] : coachRow

    const useBrandColorsStr = (await headers()).get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

    const sidebarMobile = <DashboardSidebarBlocks userId={user.id} coachSlug={coach_slug} />
    const sidebarDesktop = <DashboardSidebarBlocks userId={user.id} coachSlug={coach_slug} />

    const beforeSidebar = (
        <>
            <Suspense fallback={<DashboardHeaderSkeleton />}>
                <DashboardHeader
                    userId={user.id}
                    coachSlug={coach_slug}
                    initialUseBrandColors={initialUseBrandColors}
                    brandName={coachBranding?.brand_name}
                    welcomeMessage={coachBranding?.welcome_message}
                />
            </Suspense>
            <Suspense fallback={<CalendarSkeleton />}>
                <WeekCalendar userId={user.id} />
            </Suspense>
            <Suspense fallback={<CheckInSkeleton />}>
                <CheckInBanner userId={user.id} coachSlug={coach_slug} />
            </Suspense>
            <Suspense fallback={<HeroAndComplianceSkeleton />}>
                <HeroAndComplianceGroup userId={user.id} coachSlug={coach_slug} />
            </Suspense>
        </>
    )

    const afterSidebar = (
        <>
            <Suspense fallback={<ProgramSkeleton />}>
                <ActiveProgramSection userId={user.id} coachSlug={coach_slug} />
            </Suspense>
            <Suspense fallback={<HistorySkeleton />}>
                <RecentWorkoutsSection userId={user.id} coachSlug={coach_slug} />
            </Suspense>
            <Suspense fallback={<WeightChartSkeleton />}>
                <WeightFullChartSection userId={user.id} coachSlug={coach_slug} />
            </Suspense>
        </>
    )

    return (
        <DashboardPullToRefresh>
            <DashboardShell beforeSidebar={beforeSidebar} sidebarMobile={sidebarMobile} sidebarDesktop={sidebarDesktop} afterSidebar={afterSidebar} />
            <WelcomeModal
                brandName={coachBranding?.brand_name ?? 'Tu Coach'}
                welcomeModalEnabled={coachBranding?.welcome_modal_enabled ?? false}
                welcomeModalContent={coachBranding?.welcome_modal_content ?? null}
                welcomeModalType={coachBranding?.welcome_modal_type ?? 'text'}
                welcomeModalVersion={coachBranding?.welcome_modal_version ?? 0}
            />
        </DashboardPullToRefresh>
    )
}
