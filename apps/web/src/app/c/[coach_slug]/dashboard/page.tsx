import { Suspense } from 'react'
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
import { getClientDashboardUser, getClientProfile, getActiveOrgAnnouncements } from './_data/dashboard.queries'
import { OrgAnnouncementBanner } from './_components/OrgAnnouncementBanner'
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

import { getClientBasePath } from '@/lib/client/base-path'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientDashboardPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const user = await getClientDashboardUser()
    if (!user) redirect(`${base}/login`)

    const { client } = await getClientProfile(user.id)
    if (!client) redirect(`${base}/login`)

    const coachRow = client.coaches
    const coachBranding = Array.isArray(coachRow) ? coachRow[0] : coachRow

    const announcements = client.org_id ? await getActiveOrgAnnouncements(client.org_id) : []

    const headersList = await headers()
    const useBrandColorsStr = headersList.get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

    // Pool/team: el proxy /t reescribe a /c y reenvía la marca del TEAM en headers. La fila coaches
    // anidada trae la marca PERSONAL del coach asignado — no debe filtrarse al alumno de pool. En
    // contexto team usamos el nombre del team para el saludo y suprimimos el modal de bienvenida
    // PERSONAL del coach (lo gestiona el dueño del team, no el coach). Standalone => sin cambios.
    const basePath = headersList.get('x-client-base-path') ?? ''
    const isTeamContext = headersList.get('x-workspace-brand-source') === 'organization' || basePath.startsWith('/t')
    const headerTeamBrandName = headersList.get('x-coach-brand-name')

    const greetingBrandName = isTeamContext ? headerTeamBrandName : coachBranding?.brand_name
    const greetingWelcomeMessage = isTeamContext ? null : coachBranding?.welcome_message
    const welcomeModalEnabled = isTeamContext ? false : (coachBranding?.welcome_modal_enabled ?? false)

    const sidebarMobile = <DashboardSidebarBlocks userId={user.id} coachSlug={coach_slug} />
    const sidebarDesktop = <DashboardSidebarBlocks userId={user.id} coachSlug={coach_slug} />

    const beforeSidebar = (
        <>
            {announcements.length > 0 && <OrgAnnouncementBanner announcements={announcements} />}
            <Suspense fallback={<DashboardHeaderSkeleton />}>
                <DashboardHeader
                    userId={user.id}
                    coachSlug={coach_slug}
                    initialUseBrandColors={initialUseBrandColors}
                    brandName={greetingBrandName}
                    welcomeMessage={greetingWelcomeMessage}
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
                brandName={(isTeamContext ? headerTeamBrandName : coachBranding?.brand_name) ?? 'Tu Coach'}
                welcomeModalEnabled={welcomeModalEnabled}
                welcomeModalContent={isTeamContext ? null : (coachBranding?.welcome_modal_content ?? null)}
                welcomeModalType={coachBranding?.welcome_modal_type ?? 'text'}
                welcomeModalVersion={coachBranding?.welcome_modal_version ?? 0}
            />
        </DashboardPullToRefresh>
    )
}
