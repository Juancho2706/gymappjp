import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'

import { DashboardShell } from './_components/DashboardShell'
import { DashboardPullToRefresh } from './_components/DashboardPullToRefresh'
import { DashboardHeader } from './_components/DashboardHeader'
import { StreakRibbonSection } from './_components/streak/StreakRibbonSection'
import { CheckInBanner } from './_components/checkin/CheckInBanner'
import { HeroAndComplianceGroup } from './_components/HeroAndComplianceGroup'
import { CoachPresenceCard } from './_components/coach/CoachPresenceCard'
import { MomentumCard } from './_components/momentum/MomentumCard'
import { ActiveProgramSection } from './_components/program/ActiveProgramSection'
import { WeightWidget } from './_components/weight/WeightWidget'
import { PersonalRecordsCard } from './_components/records/PersonalRecordsCard'
import { RecentWorkoutsSection } from './_components/history/RecentWorkoutsSection'
import { HabitsTrackerWidget } from './_components/habits/HabitsTrackerWidget'
import { NutritionDailySummary } from './_components/nutrition/NutritionDailySummary'
import { SectionTitle } from './_components/shared/SectionTitle'
import { WelcomeModal } from './_components/WelcomeModal'
import { getClientDashboardUser, getClientProfile, getActiveOrgAnnouncements } from './_data/dashboard.queries'
import { OrgAnnouncementBanner } from './_components/OrgAnnouncementBanner'
import {
    DashboardHeaderSkeleton,
    CheckInSkeleton,
    HeroAndComplianceSkeleton,
    ProgramSkeleton,
    HistorySkeleton,
    WeightSkeleton,
    NutritionSkeleton,
    HabitsSkeleton,
    ComplianceRingsSkeleton,
    PersonalRecordsSkeleton,
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

    return (
        <DashboardPullToRefresh>
            <DashboardShell>
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

                {/* Racha ribbon — protagonista de retención */}
                <Suspense fallback={null}>
                    <StreakRibbonSection userId={user.id} />
                </Suspense>

                {/* Check-in banner (variant-aware) */}
                <Suspense fallback={<CheckInSkeleton />}>
                    <CheckInBanner userId={user.id} coachSlug={coach_slug} />
                </Suspense>

                {/* HERO — qué hago hoy (workout) o descanso */}
                <Suspense fallback={<HeroAndComplianceSkeleton />}>
                    <HeroAndComplianceGroup userId={user.id} coachSlug={coach_slug} />
                </Suspense>

                {/* Coach presence */}
                <Suspense fallback={null}>
                    <CoachPresenceCard
                        userId={user.id}
                        coachSlug={coach_slug}
                        brandName={greetingBrandName}
                        note={greetingWelcomeMessage}
                    />
                </Suspense>

                {/* Momentum — semana + cumplimiento fusionados */}
                <Suspense fallback={<ComplianceRingsSkeleton />}>
                    <MomentumCard userId={user.id} coachSlug={coach_slug} />
                </Suspense>

                {/* Programa activo + barra de fases */}
                <div>
                    <SectionTitle>Tu programa</SectionTitle>
                    <Suspense fallback={<ProgramSkeleton />}>
                        <ActiveProgramSection userId={user.id} coachSlug={coach_slug} />
                    </Suspense>
                </div>

                {/* Peso + records */}
                <div>
                    <SectionTitle accent="var(--sport-500)">Peso y records</SectionTitle>
                    <div className="flex flex-col gap-3">
                        <Suspense fallback={<WeightSkeleton />}>
                            <WeightWidget userId={user.id} coachSlug={coach_slug} />
                        </Suspense>
                        <Suspense fallback={<PersonalRecordsSkeleton />}>
                            <PersonalRecordsCard userId={user.id} />
                        </Suspense>
                    </div>
                </div>

                {/* Actividad reciente */}
                <Suspense fallback={<HistorySkeleton />}>
                    <RecentWorkoutsSection userId={user.id} coachSlug={coach_slug} />
                </Suspense>

                {/* Hábitos de hoy */}
                <div>
                    <SectionTitle accent="var(--aqua-700, #0A6E8D)">Hábitos de hoy</SectionTitle>
                    <Suspense fallback={<HabitsSkeleton />}>
                        <HabitsTrackerWidget userId={user.id} coachSlug={coach_slug} />
                    </Suspense>
                </div>

                {/* Nutrición de hoy */}
                <div>
                    <SectionTitle accent="var(--ember-500)" action="Ver dieta" actionHref={`${base}/nutrition`}>
                        Nutrición de hoy
                    </SectionTitle>
                    <Suspense fallback={<NutritionSkeleton />}>
                        <NutritionDailySummary userId={user.id} coachSlug={coach_slug} />
                    </Suspense>
                </div>
            </DashboardShell>
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
