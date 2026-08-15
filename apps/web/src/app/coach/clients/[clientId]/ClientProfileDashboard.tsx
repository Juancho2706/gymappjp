'use client'

import { useState, useCallback, useTransition } from 'react'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { getProfileTopAlert } from './getProfileTopAlert'
import { ProfileTopAlertBanner } from './ProfileTopAlertBanner'
import { ProfileTabNav, type ProfileMainTabId, type ProfileTabBadges } from './ProfileTabNav'
import { SectionTitle } from './_components/SectionTitle'
import { ProfileOverviewB3 } from './ProfileOverviewB3'
import { TrainingTabB4Panels } from './TrainingTabB4Panels'
import { NutritionTabV2, NutritionTabV2Unavailable } from './NutritionTabV2'
import type { NutritionTabV2ViewModel } from './nutritionTabV2.logic'
import { ProgressBodyCompositionB6 } from './ProgressBodyCompositionB6'
import { ProgramTabB7 } from './ProgramTabB7'
// Facturación no es una pestaña de la ficha (rediseño dark-only: 5 pestañas). `BillingTabB8`
// quedó sin importadores y se borró en la poda 2026-07-29, junto con la lectura muerta de
// `client_payments` en `client-detail.service.ts`. Se administra desde el dashboard del coach.
import { ProfileFloatingActions } from './ProfileFloatingActions'
import { SharePRButton } from '@/components/shared/SharePRButton'
import {
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { updateClientGoalWeight } from './_actions/client-detail.actions'

interface ClientProfileDashboardProps {
    data: any // using any temporarily to save time on type definitions
    /** Entitlements de módulos de pago (espejo del gate server-side, resueltos en page.tsx). */
    moduleFlags?: { cardio: boolean; movement: boolean; bodycomp: boolean }
    /**
     * View model del resumen de Nutrición V2 (resuelto server-side en `_data/nutrition-tab-v2.data`).
     * Poda 2026-07-29 (docs/specs/nutrition-ui-poda/SPEC.md): el tab es SIEMPRE V2 — se retiró el
     * swap al tab V1 (`NutritionTabB5`, borrado) y con él su canary en esta superficie. `null` ⇒
     * la resolución falló y el tab pinta su estado degradado, nunca V1.
     */
    nutritionV2?: NutritionTabV2ViewModel | null
    /** Fuerza tema oscuro para los charts (la ficha del master-detail es dark-only vía isla CSS;
        next-themes resolvedTheme no la conoce → sin esto los ejes saldrían claros sobre negro). */
    forceDark?: boolean
}

export function ClientProfileDashboard({
    data,
    moduleFlags,
    nutritionV2,
    forceDark = false,
}: ClientProfileDashboardProps) {
    const reduceMotion = useReducedMotion()
    const [activeTab, setActiveTab] = useState<ProfileMainTabId>('overview')
    const [isPending, startTransition] = useTransition()

    const handleTabChange = useCallback((id: ProfileMainTabId) => {
        startTransition(() => {
            setActiveTab(id)
        })
    }, [])

    const { resolvedTheme } = useTheme()
    const { client, checkIns } = data
    const [goalWeight, setGoalWeight] = useState<number | null>(
        typeof client?.goal_weight_kg === 'number' ? client.goal_weight_kg : null
    )
    const [goalWeightInput, setGoalWeightInput] = useState(goalWeight?.toString() ?? '')
    const [isSavingGoal, setIsSavingGoal] = useState(false)

    const coachSlug =
        client?.coaches == null
            ? undefined
            : Array.isArray(client.coaches)
              ? client.coaches[0]?.slug
              : client.coaches.slug


    const isDark = forceDark || resolvedTheme === 'dark'
    const chartGridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const chartAxisColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    const tooltipBgColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'
    const tooltipBorderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const tooltipTextColor = isDark ? '#fff' : '#000'

    const checkInsWithPhotos = (checkIns || []).filter((c: any) => c.front_photo_url || c.side_photo_url || c.back_photo_url).slice(0, 3);

    const compliance = data.compliance || {};
    // Riesgo de nutrición: SIEMPRE de la señal V2 (`resolveNutritionTabV2`, la misma que pinta el
    // tab). `null` = sin plan V2 vigente o lectura fallida ⇒ pill y badge se OMITEN. Antes se
    // derivaba de `compliance.nutritionCompliancePercent` (V1) ⇒ "en riesgo" permanente + badge "!"
    // para todo alumno que registra en V2, con la semana verde en el tab de al lado.
    const isNutritionAtRisk: boolean | null = nutritionV2?.isAtRisk ?? null;

    const lastCheckIn = checkIns && checkIns.length > 0 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
        : null;

    // Dynamic Metrics Card
    const currentWeight = lastCheckIn?.weight || client.client_intake?.weight_kg || 0;
    const prevWeightCheckIn = checkIns && checkIns.length > 1 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[1] 
        : null;
    const weeklyWeightVariation = prevWeightCheckIn ? currentWeight - prevWeightCheckIn.weight : 0;
    const lastWorkoutDate = (data.workoutHistory || []).reduce((latest: string | null, plan: any) => {
        for (const block of plan.workout_blocks || []) {
            for (const log of block.workout_logs || []) {
                if (!log.logged_at) continue
                if (!latest || new Date(log.logged_at) > new Date(latest)) {
                    latest = log.logged_at
                }
            }
        }
        return latest
    }, null as string | null)

    const topAlert = getProfileTopAlert({
        checkIns,
        compliance,
        lastWorkoutDate,
    })

    const prCount = Array.isArray(data.personalRecords) ? data.personalRecords.length : 0
    const checkInTotal = (checkIns || []).length

    const abModeProgram = !!data.activeProgram?.ab_mode
    // Variante EFECTIVA: el contador de días del tab "Programa" refleja lo que el alumno ve (cae a la
    // variante con planes si la del ciclo está vacía por un A/B mal armado de una sola semana).
    const programVariantLetter = resolveEffectiveWeekVariant(
        data.activeProgram,
        (data.activeProgram?.workout_plans as { week_variant?: string | null }[] | undefined) ?? [],
        compliance.planCurrentWeek && compliance.planCurrentWeek > 0
            ? compliance.planCurrentWeek
            : null,
        new Date()
    )
    const programTrainingDayCount =
        (data.activeProgram?.workout_plans as any[] | undefined)?.filter(
            (p: any) =>
                (p?.workout_blocks?.length ?? 0) > 0 &&
                workoutPlanMatchesVariant(p, programVariantLetter, abModeProgram)
        ).length ?? 0

    const tabBadges: ProfileTabBadges = {
        progress: checkInTotal > 0 ? checkInTotal : undefined,
        workout:
            prCount > 0
                ? prCount
                : (data.workoutHistory?.length ?? 0) > 0
                  ? data.workoutHistory.length
                  : undefined,
        program: programTrainingDayCount > 0 ? programTrainingDayCount : undefined,
        // Badge V2: "!" solo con riesgo REAL; con la semana en verde muestra los días en rango y
        // sin señal (sin plan V2 vigente) no muestra nada. Antes caía al conteo de `mealDetails`
        // (comidas del plan V1), que no dice nada del cumplimiento.
        nutrition:
            isNutritionAtRisk === true
                ? '!'
                : isNutritionAtRisk === false && (nutritionV2?.weeklyInRangeDays ?? 0) > 0
                  ? nutritionV2!.weeklyInRangeDays
                  : undefined,
    }

    const goToProgressHistory = () => {
        handleTabChange('progress')
        requestAnimationFrame(() => {
            document.getElementById('profile-progress-panel')?.scrollIntoView({
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'start',
            })
        })
    }

    // Deep-link a la Zona A (Progreso) del hogar único de nutrición. NO recomputa
    // ningún número: los entry points leen los valores ya calculados (compliance/
    // motor de adherencia) y solo navegan a la pestaña Nutrición.
    const goToNutritionProgress = () => {
        handleTabChange('nutrition')
        requestAnimationFrame(() => {
            document
                .getElementById('nutrition-zone-a-progreso')
                ?.scrollIntoView({
                    behavior: reduceMotion ? 'auto' : 'smooth',
                    block: 'start',
                })
        })
    }

    const tabEase = [0.25, 0.46, 0.45, 0.94] as const
    const tabMotion = {
        initial: { opacity: 0, y: reduceMotion ? 0 : 8 } as const,
        animate: { opacity: 1, y: 0 } as const,
        exit: { opacity: 0, y: reduceMotion ? 0 : -8 } as const,
        transition: reduceMotion
            ? { duration: 0 }
            : { duration: 0.18, ease: tabEase },
    }

    return (
        <div className="@container/ficha min-w-0 max-w-full space-y-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
            <ProfileTabNav activeTab={activeTab} onChange={handleTabChange} badges={tabBadges} />

            {isPending && (
                <div className="grid min-w-0 animate-pulse grid-cols-1 gap-6 md:grid-cols-12">
                    <div className="min-w-0 space-y-4 md:col-span-8">
                        <Skeleton className="h-16 rounded-xl" />
                        <Skeleton className="h-40 rounded-xl" />
                        <div className="grid grid-cols-2 gap-4">
                            <Skeleton className="h-32 rounded-xl" />
                            <Skeleton className="h-32 rounded-xl" />
                        </div>
                    </div>
                    <div className="min-w-0 space-y-4 md:col-span-4">
                        <Skeleton className="h-64 rounded-xl" />
                    </div>
                </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'overview' && !isPending && (
                    <motion.div
                        key="overview"
                        {...tabMotion}
                        className="relative z-10 w-full min-w-0 space-y-6"
                    >
                        {/* Resumen 1:1 con el diseño nuevo (coach-ficha.jsx · OverviewTab):
                            top-alert + rings + KPIs + Programa + Métricas + Check-in +
                            Evolución visual + Módulos + Editar plan, en una columna. */}
                        <ProfileTopAlertBanner alert={topAlert} />

                        <ProfileOverviewB3
                            workoutHistory={data.workoutHistory || []}
                            checkIns={checkIns || []}
                            compliance={compliance}
                            clientId={client.id}
                            activeProgram={data.activeProgram}
                            isNutritionAtRisk={isNutritionAtRisk}
                            nutritionWeeklyPct={nutritionV2?.weeklyInRangePct ?? null}
                            nutritionWeeklyDays={
                                nutritionV2 != null
                                    ? {
                                          inRange: nutritionV2.weeklyInRangeDays,
                                          tracked: nutritionV2.weeklyTrackedDays,
                                      }
                                    : null
                            }
                            lastCheckIn={lastCheckIn}
                            checkInsWithPhotos={checkInsWithPhotos}
                            currentWeight={currentWeight}
                            weeklyWeightVariation={weeklyWeightVariation}
                            initialHeightCm={client.client_intake?.height_cm ?? null}
                            initialWeightKg={client.client_intake?.weight_kg ?? null}
                            initialSex={(client.client_intake?.sex as 'male' | 'female' | 'other' | null) ?? null}
                            moduleFlags={moduleFlags}
                            dailyHabitsSummary={data.dailyHabitsSummary}
                            dailyHabits={data.dailyHabits}
                            onViewNutrition={goToNutritionProgress}
                            onViewProgress={goToProgressHistory}
                            onOpenProgram={() => handleTabChange('program')}
                        />
                    </motion.div>
                )}

                {activeTab === 'progress' && !isPending && (
                    <motion.div
                        key="progress"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                    <div id="profile-progress-panel" className="min-w-0 space-y-6 md:col-span-12">
                        {/* Objetivo de peso — controla la línea punteada "Objetivo" de la curva
                            Peso · tendencia (dentro de ProgressBodyCompositionB6). Único editor. */}
                        <Card padding="md">
                            <form
                                className="flex flex-wrap items-center gap-2"
                                onSubmit={async (e) => {
                                    e.preventDefault()
                                    const val = parseFloat(goalWeightInput)
                                    const newVal = Number.isFinite(val) && val > 0 ? val : null
                                    setIsSavingGoal(true)
                                    await updateClientGoalWeight(client.id, newVal)
                                    setGoalWeight(newVal)
                                    setIsSavingGoal(false)
                                }}
                            >
                                <label
                                    htmlFor="goal-weight-input"
                                    className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-muted"
                                >
                                    Peso objetivo (kg)
                                </label>
                                <input
                                    id="goal-weight-input"
                                    type="number"
                                    step="0.1"
                                    min="30"
                                    max="300"
                                    value={goalWeightInput}
                                    onChange={(e) => setGoalWeightInput(e.target.value)}
                                    placeholder="—"
                                    className="w-20 rounded-[10px] border border-default bg-surface-sunken px-2 py-1 text-center text-[12px] font-bold text-strong focus:border-sport-500 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={isSavingGoal}
                                    className="rounded-[10px] bg-sport-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sport-700 transition-colors hover:brightness-95 disabled:opacity-50"
                                >
                                    {isSavingGoal ? '…' : 'Guardar'}
                                </button>
                                <span className="text-[11px] text-muted">
                                    Dibuja la línea punteada en la curva de peso.
                                </span>
                            </form>
                        </Card>

                        <ProgressBodyCompositionB6
                            checkIns={checkIns || []}
                            heightCm={client?.client_intake?.height_cm}
                            goalWeight={goalWeight}
                            clientId={client?.id}
                            bodyComposition={data.bodyComposition}
                            bodycompEnabled={moduleFlags?.bodycomp}
                            chartGridColor={chartGridColor}
                            chartAxisColor={chartAxisColor}
                            tooltipBgColor={tooltipBgColor}
                            tooltipBorderColor={tooltipBorderColor}
                            tooltipTextColor={tooltipTextColor}
                        />
                    </div>
                    </motion.div>
                )}

                {activeTab === 'workout' && !isPending && (
                    <motion.div
                        key="workout"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                    <div className="min-w-0 space-y-6 md:col-span-12">
                        <TrainingTabB4Panels
                            clientId={client.id}
                            santiagoTodayIso={data.todayIso ?? ''}
                            workoutHistory={data.workoutHistory || []}
                            muscleVolumeByGroup={data.muscleVolumeByGroup || []}
                            chartGridColor={chartGridColor}
                            chartAxisColor={chartAxisColor}
                            tooltipBgColor={tooltipBgColor}
                            tooltipBorderColor={tooltipBorderColor}
                            tooltipTextColor={tooltipTextColor}
                        />

                        {(data.personalRecords?.length > 0 || data.muscleVolumeByGroup?.length > 0) && (
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                {data.personalRecords?.length > 0 && (
                                    <Card padding="md">
                                        <SectionTitle style={{ marginTop: 0 }}>Récords de peso (máx. registrado)</SectionTitle>
                                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                            {data.personalRecords.slice(0, 12).map((pr: any) => (
                                                <div
                                                    key={pr.exerciseId}
                                                    className="flex items-center justify-between rounded-control bg-surface-sunken px-3 py-2 text-xs"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-strong">{pr.exerciseName}</p>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                                                            {pr.muscleGroup}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1.5">
                                                        <span className="font-black tabular-nums text-sport-600">
                                                            {pr.maxWeightKg} kg
                                                            <span className="ml-1 text-[10px] font-bold text-muted">
                                                                ×{pr.repsAtMax}
                                                            </span>
                                                        </span>
                                                        <SharePRButton
                                                            clientId={client.id}
                                                            exerciseId={pr.exerciseId}
                                                            exerciseName={pr.exerciseName}
                                                            variant="ghost"
                                                            label={`Compartir logro${client.full_name ? ` de ${String(client.full_name).split(' ')[0]}` : ''}`}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}
                                {data.muscleVolumeByGroup?.length > 0 && (
                                    <Card padding="md">
                                        <SectionTitle style={{ marginTop: 0 }}>Volumen últimos 30 días</SectionTitle>
                                        <p className="mb-3 text-[10px] font-medium text-muted">
                                            Σ (peso × reps) por grupo muscular.
                                        </p>
                                        <div className="space-y-2">
                                            {data.muscleVolumeByGroup.slice(0, 8).map((row: any) => {
                                                const maxV = data.muscleVolumeByGroup[0]?.volume || 1
                                                const pct = Math.min(100, Math.round((row.volume / maxV) * 100))
                                                return (
                                                    <div key={row.muscleGroup}>
                                                        <div className="mb-0.5 flex justify-between text-[10px] font-bold uppercase tracking-widest">
                                                            <span className="text-muted">{row.muscleGroup}</span>
                                                            <span className="tabular-nums text-strong">
                                                                {Math.round(row.volume).toLocaleString('es-ES')} u.
                                                            </span>
                                                        </div>
                                                        <Progress value={pct} className="h-1 bg-surface-sunken" />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        )}

                    </div>
                    </motion.div>
                )}

                {activeTab === 'program' && !isPending && (
                    <motion.div
                        key="program"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                        <div className="animate-in fade-in min-w-0 space-y-6 duration-500 md:col-span-12">
                            <ProgramTabB7
                                clientId={client.id}
                                activeProgram={data.activeProgram}
                                workoutHistory={data.workoutHistory || []}
                                planCurrentWeek={compliance.planCurrentWeek ?? 0}
                                planTotalWeeks={compliance.planTotalWeeks ?? 1}
                                planDaysRemaining={compliance.planDaysRemaining ?? 0}
                            />
                        </div>
                    </motion.div>
                )}

                {/* Tab Nutrición — SIEMPRE el resumen V2 (poda 2026-07-29:
                    docs/specs/nutrition-ui-poda/SPEC.md ola 3 §6). El detalle vive en
                    /coach/nutrition-v2/[clientId].
                    Acá vivían las secciones V1 retiradas por decisión del owner ("V1 al olvido",
                    mismo SPEC): "Ciclo de dieta" (NutritionCycleHistorySection — los ciclos no se
                    usan; el cron api/cron/nutrition-cycles y los datos quedan intactos), los
                    umbrales de micronutrientes (CoachNutrientTargetsEditor — micros NO se entregan
                    en V2, claim retirado) y "Funciones para este alumno" (override de feature prefs
                    por alumno, que solo gobernaba esos micros). */}
                {activeTab === 'nutrition' && !isPending && (
                    <motion.div
                        key="nutrition"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                    <div className="min-w-0 space-y-6 animate-in fade-in duration-500 md:col-span-12">
                        {nutritionV2 ? (
                            <NutritionTabV2 view={nutritionV2} />
                        ) : (
                            <NutritionTabV2Unavailable clientId={client.id} />
                        )}
                    </div>
                    </motion.div>
                )}

            </AnimatePresence>

            <ProfileFloatingActions
                clientId={client.id}
                clientPhone={client.phone}
                coachSlug={coachSlug}
            />
        </div>
    )
}
