import { Suspense } from 'react'

import { DesktopDashboardHead } from './DesktopDashboardHead'
import { CheckInBanner } from '../checkin/CheckInBanner'
import { HeroAndComplianceGroup } from '../HeroAndComplianceGroup'
import { CoachPresenceCard } from '../coach/CoachPresenceCard'
import { MomentumCard } from '../momentum/MomentumCard'
import { ActiveProgramSection } from '../program/ActiveProgramSection'
import { WeightWidget } from '../weight/WeightWidget'
import { PersonalRecordsCard } from '../records/PersonalRecordsCard'
import { RecentWorkoutsSection } from '../history/RecentWorkoutsSection'
import { HabitsTrackerWidget } from '../habits/HabitsTrackerWidget'
import { NutritionDailySummary } from '../nutrition/NutritionDailySummary'
import { SectionTitle } from '../shared/SectionTitle'
import {
    CheckInSkeleton,
    ComplianceRingsSkeleton,
    DashboardHeaderSkeleton,
    HabitsSkeleton,
    HeroAndComplianceSkeleton,
    HistorySkeleton,
    NutritionSkeleton,
    PersonalRecordsSkeleton,
    ProgramSkeleton,
    WeightSkeleton,
} from '../dashboard-skeletons'

/**
 * Bento desktop del alumno (>=760 — `DesktopAlumnoDashboard` del kit eva-desktop).
 *
 * Estructura del kit: head (saludo + chip racha) → grid `1.5fr / 1fr` (main + sidebar).
 * El kit colapsa a 1 columna <1000px (`.dt-dash-grid @media max-width:1000px`); acá el 2-col
 * arranca en `lg` (~1024) y debajo de eso (760–1024) el bento fluye en 1 columna — idéntico a la
 * regla responsive del kit. Sidebar `sticky` solo en 2-col real (lg+), donde es más corto que el main.
 *
 * La app es MÁS RICA que el bento del kit (que solo trae hero, programa, cumplimiento, peso,
 * nutrición): se conservan SIN degradar check-in, coach, actividad reciente, hábitos y records,
 * repartidos main/sidebar según su rol (flujo vs métrica). Mismos componentes que el árbol móvil
 * → mismos datos reales + server actions; `React.cache` deduplica las queries entre ambos árboles.
 */
export function DashboardDesktop({
    userId,
    coachSlug,
    base,
    initialUseBrandColors,
    brandName,
    welcomeMessage,
}: {
    userId: string
    coachSlug: string
    base: string
    initialUseBrandColors: boolean
    brandName?: string | null
    welcomeMessage?: string | null
}) {
    return (
        <div>
            <Suspense fallback={<DashboardHeaderSkeleton />}>
                <DesktopDashboardHead userId={userId} coachSlug={coachSlug} initialUseBrandColors={initialUseBrandColors} />
            </Suspense>

            {/* Check-in banner full-width (la app lo trae; el kit lo omite — no degradar) */}
            <Suspense fallback={<CheckInSkeleton />}>
                <CheckInBanner userId={userId} coachSlug={coachSlug} />
            </Suspense>

            <div className="mt-3.5 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[1.5fr_1fr] lg:gap-5">
                {/* ── MAIN (flujo: qué hago hoy) ── */}
                <div className="flex min-w-0 flex-col gap-3.5">
                    <Suspense fallback={<HeroAndComplianceSkeleton />}>
                        <HeroAndComplianceGroup userId={userId} coachSlug={coachSlug} />
                    </Suspense>

                    <Suspense fallback={null}>
                        <CoachPresenceCard userId={userId} coachSlug={coachSlug} brandName={brandName} note={welcomeMessage} />
                    </Suspense>

                    <div>
                        <SectionTitle>Tu programa</SectionTitle>
                        <Suspense fallback={<ProgramSkeleton />}>
                            <ActiveProgramSection userId={userId} coachSlug={coachSlug} />
                        </Suspense>
                    </div>

                    <Suspense fallback={<HistorySkeleton />}>
                        <RecentWorkoutsSection userId={userId} coachSlug={coachSlug} />
                    </Suspense>

                    <div>
                        <SectionTitle accent="var(--aqua-700, #0A6E8D)">Hábitos de hoy</SectionTitle>
                        <Suspense fallback={<HabitsSkeleton />}>
                            <HabitsTrackerWidget userId={userId} coachSlug={coachSlug} />
                        </Suspense>
                    </div>
                </div>

                {/* ── SIDEBAR (métricas) — sticky en 2-col real (lg+) ── */}
                <div className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-6 lg:self-start">
                    {/* Cumplimiento del kit, pero más rico: tira semanal + 3 anillos fusionados */}
                    <Suspense fallback={<ComplianceRingsSkeleton />}>
                        <MomentumCard userId={userId} coachSlug={coachSlug} />
                    </Suspense>

                    <div>
                        <SectionTitle accent="var(--sport-500)">Peso y records</SectionTitle>
                        <div className="flex flex-col gap-3">
                            <Suspense fallback={<WeightSkeleton />}>
                                <WeightWidget userId={userId} coachSlug={coachSlug} />
                            </Suspense>
                            <Suspense fallback={<PersonalRecordsSkeleton />}>
                                <PersonalRecordsCard userId={userId} />
                            </Suspense>
                        </div>
                    </div>

                    <div>
                        <SectionTitle accent="var(--ember-500)" action="Ver dieta" actionHref={`${base}/nutrition`}>
                            Nutrición de hoy
                        </SectionTitle>
                        <Suspense fallback={<NutritionSkeleton />}>
                            <NutritionDailySummary userId={userId} coachSlug={coachSlug} />
                        </Suspense>
                    </div>
                </div>
            </div>
        </div>
    )
}
