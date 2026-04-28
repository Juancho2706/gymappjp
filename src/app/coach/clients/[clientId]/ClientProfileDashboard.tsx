'use client'

import { useState, useCallback, useTransition } from 'react'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Activity, Dumbbell, User, Edit2, Plus, ChevronDown, ChevronUp, CheckCircle2, PieChart as PieChartIcon, Flame, TrendingUp, Camera, ArrowUpRight, ArrowDownRight, Minus, Trophy, Layers } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Skeleton } from '@/components/ui/skeleton'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Legend, Cell, BarChart, ReferenceLine } from 'recharts'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { getProfileTopAlert } from './getProfileTopAlert'
import { ProfileTopAlertBanner } from './ProfileTopAlertBanner'
import { ProfileTabNav, type ProfileMainTabId, type ProfileTabBadges } from './ProfileTabNav'
import { ProfileOverviewB3 } from './ProfileOverviewB3'
import { ProfileProgramSummaryCard } from './ProfileProgramSummaryCard'
import { ProfileCheckInSnapshot } from './ProfileCheckInSnapshot'
import { TrainingTabB4Panels } from './TrainingTabB4Panels'
import { NutritionTabB5 } from './NutritionTabB5'
import { ProgressBodyCompositionB6 } from './ProgressBodyCompositionB6'
import { ProgramTabB7 } from './ProgramTabB7'
import { BillingTabB8 } from './BillingTabB8'
import { ProfileFloatingActions } from './ProfileFloatingActions'
import {
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { effectiveWorkoutSection } from '@/lib/workout-block-grouping'
import { updateClientGoalWeight } from './actions'

interface ClientProfileDashboardProps {
    data: any // using any temporarily to save time on type definitions
}

export function ClientProfileDashboard({ data }: ClientProfileDashboardProps) {
    const reduceMotion = useReducedMotion()
    const [activeTab, setActiveTab] = useState<ProfileMainTabId>('overview')
    const [isPending, startTransition] = useTransition()

    const handleTabChange = useCallback((id: ProfileMainTabId) => {
        startTransition(() => {
            setActiveTab(id)
        })
    }, [])
    const [activeChart, setActiveChart] = useState('peso_composicion')
    const [expandedWorkouts, setExpandedWorkouts] = useState<string[]>([])
    const { resolvedTheme } = useTheme()
    const { client, checkIns, payments } = data
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

    const toggleWorkout = (id: string) => {
        setExpandedWorkouts(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const isDark = resolvedTheme === 'dark'
    const chartGridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const chartAxisColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    const tooltipBgColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'
    const tooltipBorderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const tooltipTextColor = isDark ? '#fff' : '#000'

    // Preparar datos para gráfico de peso y métrica secundaria (Energía/Body Comp simulado si no hay)
    let previousWeight = 0;
    const weightData = [...(checkIns || [])]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c, index) => {
            const currentWeight = c.weight;
            const weightChange = index === 0 ? 0 : currentWeight - previousWeight;
            previousWeight = currentWeight;
            
            return {
                date: new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                peso: currentWeight,
                // Usamos energy_level si existe, sino lo simulamos para tener una segunda métrica
                energia: c.energy_level ?? 0,
                cambio_peso: Number(weightChange.toFixed(2))
            };
        });

    // Módulo de Fuerza y Rendimiento
    // 1. Gráfico Relative Strength Index (1RM)
    const calculate1RM = (weight: number, reps: number) => {
        if (!weight || !reps) return 0;
        return weight * (1 + reps / 30);
    }
    
    const keyExercises = ['bench press', 'squat', 'deadlift', 'press de banca', 'sentadilla', 'peso muerto'];
    
    const strengthDataMap = new Map();
    const tonnageDataMap = new Map();
    let totalVolume = 0;
    let totalWorkouts = 0;
    
    (data.workoutHistory || []).forEach((plan: any) => {
        const dateStr = new Date(plan.assigned_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        
        let planVolume = 0;
        let planLoggedSets = false;

        if (plan.workout_blocks) {
            plan.workout_blocks.forEach((block: any) => {
                const exName = (block.exercises?.name || '').toLowerCase();
                const isKeyExercise = keyExercises.some(ke => exName.includes(ke));
                let exMax1RM = 0;
                
                if (block.workout_logs) {
                    block.workout_logs.forEach((log: any) => {
                        if (log.weight && log.reps) {
                            planLoggedSets = true;
                            const volume = log.weight * log.reps;
                            planVolume += volume;
                            totalVolume += volume;
                            
                            if (isKeyExercise) {
                                const rep1RM = calculate1RM(log.weight, log.reps);
                                if (rep1RM > exMax1RM) {
                                    exMax1RM = rep1RM;
                                }
                            }
                        }
                    });
                }
                
                if (isKeyExercise && exMax1RM > 0) {
                    if (!strengthDataMap.has(dateStr)) {
                        strengthDataMap.set(dateStr, { date: dateStr });
                    }
                    const exKey = exName.includes('bench') || exName.includes('banca') ? 'bench' :
                                  exName.includes('squat') || exName.includes('sentadilla') ? 'squat' : 'deadlift';
                    
                    const existingData = strengthDataMap.get(dateStr);
                    if (!existingData[exKey] || exMax1RM > existingData[exKey]) {
                        existingData[exKey] = Math.round(exMax1RM);
                    }
                }
            });
        }
        
        if (planLoggedSets) {
            totalWorkouts++;
            if (!tonnageDataMap.has(dateStr)) {
                tonnageDataMap.set(dateStr, { date: dateStr, volumen: planVolume });
            } else {
                tonnageDataMap.get(dateStr).volumen += planVolume;
            }
        }
    });

    const strengthData = Array.from(strengthDataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tonnageData = Array.from(tonnageDataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Métrica de Densidad (Asumiendo 60 min por entrenamiento para estimar si no hay tiempo explícito)
    const estimatedTrainingMinutes = totalWorkouts * 60;
    const trainingDensity = estimatedTrainingMinutes > 0 ? (totalVolume / estimatedTrainingMinutes).toFixed(1) : 0;

    // --- MÓDULO DE NUTRICIÓN E INTELIGENCIA FORENSE ---
    const activeNutritionPlan = data.activeNutritionPlanWithMeals ?? data.nutritionPlans?.[0]
    const targetCalories =
        activeNutritionPlan?.daily_calories ?? activeNutritionPlan?.target_calories ?? 0
    const targetProtein = activeNutritionPlan?.protein_g ?? activeNutritionPlan?.target_protein ?? 0
    const targetCarbs = activeNutritionPlan?.carbs_g ?? activeNutritionPlan?.target_carbs ?? 0
    const targetFats = activeNutritionPlan?.fats_g ?? activeNutritionPlan?.target_fats ?? 0

    const nutritionLogsSource = data.nutritionLogsEnriched ?? data.nutritionLogs ?? []

    // Procesar logs de nutrición (ventana ampliada en servidor; consumos reales por comidas completadas)
    const nutritionHistory = [...nutritionLogsSource]
        .sort((a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime())
        .map((log: Record<string, unknown>) => {
            const mealLogs: unknown[] = (log.nutrition_meal_logs as unknown[]) || []
            const total = mealLogs.length
            const done = mealLogs.filter((ml: unknown) => (ml as { is_completed?: boolean }).is_completed).length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const logDate = String(log.log_date)
            return {
                date: new Date(logDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                log_date: logDate,
                plan_name: (log.plan_name_at_log as string) || '',
                target_calories: (log.target_calories_at_log as number) || 0,
                target_protein: (log.target_protein_at_log as number) || 0,
                target_carbs: (log.target_carbs_at_log as number) || 0,
                target_fats: (log.target_fats_at_log as number) || 0,
                consumed_calories: (log.consumed_calories as number) || 0,
                consumed_protein: (log.consumed_protein as number) || 0,
                consumed_carbs: (log.consumed_carbs as number) || 0,
                consumed_fats: (log.consumed_fats as number) || 0,
                mealsTotal: total,
                mealsDone: done,
                compliancePct: pct,
                mealLogs,
                diferencial: 0,
                isAdherent: pct >= 80,
            }
        })

    // Calcular Diferencial Acumulado
    let runningDiff = 0;
    const accumulatedData = nutritionHistory.map(item => {
        runningDiff += item.diferencial;
        return { ...item, acumulado: runningDiff };
    });

    const checkInsWithPhotos = (checkIns || []).filter((c: any) => c.front_photo_url || c.side_photo_url || c.back_photo_url).slice(0, 3);

    const compliance = data.compliance || {};
    const nutritionCompliancePercent = compliance.nutritionCompliancePercent || 0;
    const isNutritionAtRisk = nutritionCompliancePercent < 60;

    const lastCheckIn = checkIns && checkIns.length > 0 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
        : null;

    // Dynamic Metrics Card
    const currentWeight = lastCheckIn?.weight || client.client_intake?.weight_kg || 0;
    const prevWeightCheckIn = checkIns && checkIns.length > 1 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[1] 
        : null;
    const weeklyWeightVariation = prevWeightCheckIn ? currentWeight - prevWeightCheckIn.weight : 0;
    const interactionStreak = compliance.currentStreak || 0
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

    const chartTabs = [
        { id: 'peso_composicion', label: '⚖️ Peso & Comp.' },
        { id: 'tasa_cambio', label: '📊 Tasa Cambio' },
        { id: 'fuerza', label: '💪 Fuerza (1RM)' },
        { id: 'volumen', label: '🏋️ Volumen' },
        { id: 'distribucion_macros', label: '🍽️ Macros' },
        { id: 'adherencia_calorica', label: '📉 Adherencia' },
        { id: 'balance_neto', label: '⚖️ Balance Neto' },
    ]

    const prCount = Array.isArray(data.personalRecords) ? data.personalRecords.length : 0
    const checkInTotal = (checkIns || []).length
    const mealDetailCount = Array.isArray(data.mealDetails) ? data.mealDetails.length : 0
    const pendingPayments = (payments || []).filter(
        (p: { status?: string }) => String(p.status || '').toLowerCase() === 'pending'
    ).length

    const abModeProgram = !!data.activeProgram?.ab_mode
    const programVariantLetter = resolveActiveWeekVariantForDisplay(
        data.activeProgram,
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
        nutrition: isNutritionAtRisk ? '!' : mealDetailCount > 0 ? mealDetailCount : undefined,
        billing: pendingPayments > 0 ? pendingPayments : undefined,
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
        <div className="min-w-0 max-w-full space-y-6">
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
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                        {/* Task 2: Rediseño de Overview */}
                        <div className="min-w-0 space-y-6 md:col-span-8">
                            <ProfileTopAlertBanner alert={topAlert} />

                            <ProfileOverviewB3
                                workoutHistory={data.workoutHistory || []}
                                checkIns={checkIns || []}
                                compliance={compliance}
                            />

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <ProfileProgramSummaryCard
                                    activeProgram={data.activeProgram}
                                    compliance={compliance}
                                    isNutritionAtRisk={isNutritionAtRisk}
                                />
                                <ProfileCheckInSnapshot
                                    checkIn={lastCheckIn}
                                    onViewHistory={goToProgressHistory}
                                />
                            </div>

                            {/* Miniaturas de Check-in */}
                            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                    <Camera className="w-4 h-4" /> Evolución Visual (Último Mes)
                                </h3>
                                {checkInsWithPhotos.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-4 relative z-10">
                                        {checkInsWithPhotos.map((c: any, i: number) => (
                                            <div key={i} className="relative aspect-[3/4] bg-secondary/50 rounded-xl overflow-hidden group">
                                                <Image 
                                                    src={c.front_photo_url || c.side_photo_url || c.back_photo_url} 
                                                    alt="Progreso" 
                                                    fill 
                                                    className="object-cover transition-transform duration-500 group-hover:scale-110" 
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                                        {new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center border border-dashed border-border/50 rounded-xl bg-secondary/20 relative z-10">
                                        <Camera className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground font-medium">Sin fotos recientes de check-in.</p>
                                    </div>
                                )}
                            </GlassCard>
                        </div>
                        <div className="min-w-0 space-y-6 md:col-span-4">
                            {/* Task 2: Dynamic Metrics Card */}
                            <GlassCard className="p-4 flex flex-col border-dashed border-border/50 dark:border-white/10 relative overflow-hidden h-full">
                                <div className="flex justify-between items-center mb-6 relative z-10">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Activity className="w-4 h-4" /> Métricas Clave
                                    </h3>
                                    <Dialog>
                                        <DialogTrigger render={
                                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/10 hover:text-primary">
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                        } />
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle className="uppercase font-black tracking-tighter text-xl">Editar Biometría Inicial</DialogTitle>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="height" className="text-right text-xs font-bold uppercase tracking-widest">Altura</Label>
                                                    <Input id="height" defaultValue={client.client_intake?.height_cm} className="col-span-3" placeholder="cm" />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="weight" className="text-right text-xs font-bold uppercase tracking-widest">Peso Inicial</Label>
                                                    <Input id="weight" defaultValue={client.client_intake?.weight_kg} className="col-span-3" placeholder="kg" />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-3">
                                                <Button variant="outline" className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
                                                <Button className="text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90">Guardar Cambios</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="space-y-6 relative z-10 flex-1 flex flex-col justify-center">
                                    {/* Peso Actual */}
                                    <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3"/> Peso Actual</span>
                                            <span className="text-2xl font-black text-foreground">{currentWeight} <span className="text-sm font-medium text-muted-foreground">kg</span></span>
                                        </div>
                                    </div>
                                    
                                    {/* Variación Semanal */}
                                    <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Var. Semanal</span>
                                            <span className="text-lg font-black flex items-center gap-1">
                                                {Math.abs(weeklyWeightVariation).toFixed(1)} kg
                                                {weeklyWeightVariation > 0 ? (
                                                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                                                ) : weeklyWeightVariation < 0 ? (
                                                    <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <Minus className="w-4 h-4 text-muted-foreground" />
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            </GlassCard>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'progress' && !isPending && (
                    <motion.div
                        key="progress"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                    <div className="min-w-0 space-y-6 md:col-span-12">
                        <ProgressBodyCompositionB6
                            checkIns={checkIns || []}
                            heightCm={client?.client_intake?.height_cm}
                            chartGridColor={chartGridColor}
                            chartAxisColor={chartAxisColor}
                            tooltipBgColor={tooltipBgColor}
                            tooltipBorderColor={tooltipBorderColor}
                            tooltipTextColor={tooltipTextColor}
                        />

                        {/* Task 3: Panel de Progreso Unificado */}
                        <GlassCard id="profile-progress-panel" className="p-6 md:p-8 flex flex-col border-dashed border-border/50 dark:border-white/10 relative overflow-hidden h-[35rem]">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 relative z-10">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Activity className="w-4 h-4" /> Panel de Progreso Unificado
                                    </h3>
                                    {/* Peso objetivo inline */}
                                    <form
                                        className="flex items-center gap-1.5"
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
                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                            Objetivo (kg)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="30"
                                            max="300"
                                            value={goalWeightInput}
                                            onChange={(e) => setGoalWeightInput(e.target.value)}
                                            placeholder="—"
                                            className="w-16 text-[11px] font-bold text-center bg-muted/50 border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isSavingGoal}
                                            className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors uppercase tracking-wider disabled:opacity-50"
                                        >
                                            {isSavingGoal ? '…' : 'OK'}
                                        </button>
                                    </form>
                                </div>
                                {/* ToggleBar Superior de píldoras */}
                                <div className="flex flex-wrap gap-2">
                                    {chartTabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveChart(tab.id)}
                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                                activeChart === tab.id
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/50'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex-1 w-full relative z-10 min-h-0">
                                {activeChart === 'peso_composicion' && (
                                    weightData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={weightData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis yAxisId="left" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                                                <YAxis yAxisId="right" orientation="right" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} domain={[0, 10]} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    itemStyle={{ color: 'var(--theme-primary)' }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Line yAxisId="left" type="monotone" dataKey="peso" name="Peso (kg)" stroke="var(--theme-primary)" strokeWidth={3} dot={{ fill: 'var(--theme-primary)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                                <Line yAxisId="right" type="monotone" dataKey="energia" name="Energía (1-10)" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" dot={{ fill: '#10b981', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                                {goalWeight != null && (
                                                    <ReferenceLine yAxisId="left" y={goalWeight} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Objetivo ${goalWeight}kg`, position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }} />
                                                )}
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de check-in para mostrar el gráfico.
                                        </div>
                                    )
                                )}

                                {activeChart === 'tasa_cambio' && (
                                    weightData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={weightData.slice(1)}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    formatter={(value: any) => [`${value > 0 ? '+' : ''}${value} kg`, 'Cambio']}
                                                />
                                                <Bar dataKey="cambio_peso" name="Cambio Neto" radius={[4, 4, 0, 0]}>
                                                    {weightData.slice(1).map((entry, index) => {
                                                        const val = entry.cambio_peso;
                                                        let color = '#f59e0b';
                                                        if (Math.abs(val) > 0.6) color = '#ef4444';
                                                        else if (Math.abs(val) >= 0.2 && Math.abs(val) <= 0.6) color = '#10b981';
                                                        return <Cell key={`cell-change-${index}`} fill={color} fillOpacity={0.8} />
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos para calcular la tasa de cambio.
                                        </div>
                                    )
                                )}

                                {activeChart === 'fuerza' && (
                                    strengthData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={strengthData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Line type="monotone" dataKey="bench" name="Bench Press" stroke="#3b82f6" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                                <Line type="monotone" dataKey="squat" name="Squat" stroke="#10b981" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                                <Line type="monotone" dataKey="deadlift" name="Deadlift" stroke="#f59e0b" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de entrenamiento para calcular 1RM.
                                        </div>
                                    )
                                )}

                                {activeChart === 'volumen' && (
                                    tonnageData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={tonnageData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    formatter={(value) => [`${value} kg`, 'Volumen']}
                                                />
                                                <Bar dataKey="volumen" fill="var(--theme-primary)" opacity={0.6} radius={[4, 4, 0, 0]} />
                                                <Line type="monotone" dataKey="volumen" stroke="var(--theme-primary)" strokeWidth={2} dot={false} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de entrenamiento para mostrar el volumen.
                                        </div>
                                    )
                                )}

                                {activeChart === 'distribucion_macros' && (
                                    nutritionHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={nutritionHistory}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Bar dataKey="proteina" name="Proteína" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                                                <Bar dataKey="carbohidratos" name="Carbs" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                                                <Bar dataKey="grasas" name="Grasas" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin registros nutricionales recientes.
                                        </div>
                                    )
                                )}

                                {activeChart === 'adherencia_calorica' && (
                                    nutritionHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={nutritionHistory}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    cursor={{fill: 'transparent'}}
                                                />
                                                <Bar dataKey="calorias" name="Calorías Reales" radius={[4, 4, 0, 0]}>
                                                    {nutritionHistory.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-${index}`} 
                                                            fill={entry.isAdherent ? '#10b981' : '#ef4444'} 
                                                            fillOpacity={0.8}
                                                        />
                                                    ))}
                                                </Bar>
                                                {targetCalories > 0 && (
                                                    <Line type="monotone" dataKey={() => targetCalories} stroke={isDark ? '#fff' : '#000'} strokeDasharray="5 5" strokeWidth={1} dot={false} name="Objetivo" />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin registros para medir adherencia.
                                        </div>
                                    )
                                )}

                                {activeChart === 'balance_neto' && (
                                    accumulatedData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={accumulatedData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Bar dataKey="diferencial" name="Neto Diario" radius={[4, 4, 0, 0]}>
                                                    {accumulatedData.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-diff-${index}`} 
                                                            fill={entry.diferencial > 0 ? '#ef4444' : '#3b82f6'} 
                                                            fillOpacity={0.4}
                                                        />
                                                    ))}
                                                </Bar>
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="acumulado" 
                                                    name="Acumulado" 
                                                    stroke="var(--theme-primary)" 
                                                    strokeWidth={3} 
                                                    dot={{ fill: 'var(--theme-primary)' }} 
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin datos de balance calórico.
                                        </div>
                                    )
                                )}
                            </div>
                        </GlassCard>
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
                                    <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10">
                                        <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                                            <Trophy className="h-4 w-4" /> Récords de peso (máx. registrado)
                                        </h3>
                                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                            {data.personalRecords.slice(0, 12).map((pr: any) => (
                                                <div
                                                    key={pr.exerciseId}
                                                    className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/30 px-3 py-2 text-xs dark:border-white/10"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-bold text-foreground">{pr.exerciseName}</p>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                            {pr.muscleGroup}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 font-black tabular-nums text-primary">
                                                        {pr.maxWeightKg} kg
                                                        <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                                                            ×{pr.repsAtMax}
                                                        </span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </GlassCard>
                                )}
                                {data.muscleVolumeByGroup?.length > 0 && (
                                    <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10">
                                        <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                                            <Layers className="h-4 w-4" /> Volumen últimos 30 días
                                        </h3>
                                        <p className="mb-3 text-[10px] font-medium text-muted-foreground">
                                            Σ (peso × reps) por grupo muscular.
                                        </p>
                                        <div className="space-y-2">
                                            {data.muscleVolumeByGroup.slice(0, 8).map((row: any) => {
                                                const maxV = data.muscleVolumeByGroup[0]?.volume || 1
                                                const pct = Math.min(100, Math.round((row.volume / maxV) * 100))
                                                return (
                                                    <div key={row.muscleGroup}>
                                                        <div className="mb-0.5 flex justify-between text-[10px] font-bold uppercase tracking-widest">
                                                            <span className="text-muted-foreground">{row.muscleGroup}</span>
                                                            <span className="tabular-nums text-foreground">
                                                                {Math.round(row.volume).toLocaleString('es-ES')} u.
                                                            </span>
                                                        </div>
                                                        <Progress value={pct} className="h-1 bg-secondary" />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </GlassCard>
                                )}
                            </div>
                        )}

                        <GlassCard className="p-8 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2 relative z-10">
                                <Dumbbell className="w-4 h-4" /> Historial de Entrenamientos
                            </h3>
                            {data.workoutHistory && data.workoutHistory.length > 0 ? (
                                <div className="space-y-4 relative z-10">
                                    {data.workoutHistory.slice(0, 10).map((plan: any) => {
                                        const isExpanded = expandedWorkouts.includes(plan.id)
                                        return (
                                            <div key={plan.id} className="overflow-hidden bg-secondary/50 dark:bg-white/5 border border-border/50 dark:border-white/10 rounded-xl transition-all duration-300">
                                                <button 
                                                    onClick={() => toggleWorkout(plan.id)}
                                                    className="w-full flex justify-between items-center p-4 hover:bg-primary/5 transition-colors"
                                                >
                                                    <div className="text-left">
                                                        <p className="text-sm font-black uppercase text-foreground tracking-tight">{plan.title}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{new Date(plan.assigned_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] uppercase bg-primary/10 text-primary px-2 py-1 rounded font-black border border-primary/20 tracking-widest">
                                                            {plan.workout_blocks?.length || 0} EJERCICIOS
                                                        </span>
                                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                                    </div>
                                                </button>
                                                
                                                {isExpanded && (
                                                    <div className="p-4 border-t border-border/50 dark:border-white/5 animate-in slide-in-from-top-2 duration-300">
                                                        <div className="space-y-4">
                                                            {[...(plan.workout_blocks || [])]
                                                                .sort(
                                                                    (a: any, b: any) =>
                                                                        (a.order_index ?? 0) - (b.order_index ?? 0)
                                                                )
                                                                .map((block: any, idx: number) => {
                                                                    const sec = effectiveWorkoutSection(block.section)
                                                                    const secShort =
                                                                        sec === 'warmup'
                                                                            ? 'CAL'
                                                                            : sec === 'main'
                                                                              ? 'PRI'
                                                                              : sec === 'cooldown'
                                                                                ? 'ENF'
                                                                                : '—'
                                                                    const ss = block.superset_group?.trim()
                                                                    return (
                                                                <div key={block.id ?? idx} className="space-y-2">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                                                                            {idx + 1}
                                                                        </div>
                                                                        <h4 className="text-xs font-black uppercase tracking-tight min-w-0 flex-1">
                                                                            {block.exercises?.name}
                                                                        </h4>
                                                                        <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
                                                                            {secShort}
                                                                        </span>
                                                                        {ss && (
                                                                            <span
                                                                                className="rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest shrink-0"
                                                                                style={{
                                                                                    color: 'var(--theme-primary, #007AFF)',
                                                                                    borderColor:
                                                                                        'color-mix(in srgb, var(--theme-primary, #007AFF) 35%, transparent)',
                                                                                    backgroundColor:
                                                                                        'color-mix(in srgb, var(--theme-primary, #007AFF) 10%, transparent)',
                                                                                }}
                                                                            >
                                                                                SS · {ss}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="pl-8 overflow-x-auto">
                                                                        <table className="w-full text-[10px] uppercase font-bold tracking-widest">
                                                                            <thead>
                                                                                <tr className="text-muted-foreground border-b border-border/50 dark:border-white/5">
                                                                                    <th className="text-left py-2">Set</th>
                                                                                    <th className="text-left py-2">Reps</th>
                                                                                    <th className="text-left py-2">Peso</th>
                                                                                    <th className="text-right py-2">Estado</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {(block.workout_logs || []).map((log: any, lIdx: number) => (
                                                                                    <tr key={lIdx} className="border-b border-border/5 dark:border-white/5 last:border-0">
                                                                                        <td className="py-2">{lIdx + 1}</td>
                                                                                        <td className="py-2">{log.reps_done ?? log.reps ?? '-'}</td>
                                                                                        <td className="py-2">{log.weight_kg ?? log.weight ?? '-'} kg</td>
                                                                                        <td className="py-2 text-right">
                                                                                            <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                                {(!block.workout_logs || block.workout_logs.length === 0) && (
                                                                                    <tr>
                                                                                        <td colSpan={4} className="py-4 text-center text-muted-foreground normal-case font-medium italic">Sin logs registrados para este ejercicio.</td>
                                                                                    </tr>
                                                                                )}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                                    )
                                                                })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center relative z-10">No hay entrenamientos registrados recientemente.</p>
                            )}
                        </GlassCard>
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

                {/* Task 4: Estructura Base Nutrición */}
                {activeTab === 'nutrition' && !isPending && (
                    <motion.div
                        key="nutrition"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                    <div className="min-w-0 space-y-6 animate-in fade-in duration-500 md:col-span-12">
                        <NutritionTabB5
                            clientId={client.id}
                            coachId={client.coach_id ?? ''}
                            coachSlug={coachSlug}
                            santiagoTodayIso={data.todayIso ?? ''}
                            activeNutritionPlan={activeNutritionPlan}
                            nutritionTimeline={nutritionHistory}
                            mealDetails={data.mealDetails}
                            adherence30d={data.nutritionAdherence30d}
                            todayMacros={data.todayConsumedMacros}
                            hasTodayNutritionLog={data.hasTodayNutritionLog}
                            nutritionMonthlyAvgPct={data.nutritionMonthlyAvgPct}
                            nutritionStreakDays={data.nutritionStreakDays}
                            nutritionWeeklyAvgPct={compliance.nutritionWeeklyAvgPct}
                            nutritionPrevWeeklyAvgPct={compliance.nutritionPrevWeeklyAvgPct}
                            chartGridColor={chartGridColor}
                            chartAxisColor={chartAxisColor}
                            tooltipBgColor={tooltipBgColor}
                            tooltipBorderColor={tooltipBorderColor}
                            tooltipTextColor={tooltipTextColor}
                        />
                    </div>
                    </motion.div>
                )}

                {activeTab === 'billing' && !isPending && (
                    <motion.div
                        key="billing"
                        {...tabMotion}
                        className="relative z-10 grid min-w-0 grid-cols-1 gap-6 md:grid-cols-12"
                    >
                        <div className="animate-in fade-in min-w-0 duration-500 md:col-span-12">
                            <BillingTabB8 payments={payments || []} clientId={client.id} />
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
