import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Calendar, Dumbbell, Apple, Pencil, Activity, TrendingUp, TrendingDown, Target, Zap, Clock, ChevronRight } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { CheckInCard } from '@/components/coach/CheckInCard'
import { calculateRemainingDays } from '@/lib/utils'
import type { Metadata } from 'next'

type Client = Tables<'clients'>
type CheckIn = Tables<'check_ins'>
type NutritionPlan = Tables<'nutrition_plans'>

export const metadata: Metadata = { title: 'Alumno | COACH OP' }

export default async function ClientDetailPage({
    params,
}: {
    params: Promise<{ clientId: string }>
}) {
    const { clientId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Client

    const { data: activeProgram } = await supabase
        .from('workout_programs')
        .select(`
            *,
            workout_plans (id)
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle()

    const { data: rawNutrition } = await supabase
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    const nutritionPlans = (rawNutrition ?? []) as NutritionPlan[]

    const today = new Date().toISOString().split('T')[0]
    const { data: rawDailyLog } = await supabase
        .from('daily_nutrition_logs')
        .select(`
            *,
            nutrition_meal_logs (*)
        `)
        .eq('client_id', clientId)
        .eq('log_date', today)
        .maybeSingle()
        
    const todayLog = rawDailyLog

    const { data: rawCheckins } = await supabase
        .from('check_ins')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    const checkIns = rawCheckins as CheckIn[] | null

    const { data: rawWorkoutLogs } = await supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date,
            workout_blocks (
                id,
                target_weight_kg,
                reps,
                sets,
                exercises ( name ),
                workout_logs (
                    id,
                    set_number,
                    weight_kg,
                    reps_done,
                    rpe,
                    logged_at
                )
            )
        `)
        .eq('client_id', clientId)
        .order('assigned_date', { ascending: false })

    const workoutHistory = (rawWorkoutLogs || []).map((plan: any) => {
        let totalSets = 0
        let completedSets = 0
        const exerciseLogs: any[] = []
        
        plan.workout_blocks?.forEach((block: any) => {
            const blockSets = block.sets || 0
            totalSets += blockSets
            const hasLogs = block.workout_logs && block.workout_logs.length > 0

            if (hasLogs) {
                completedSets += block.workout_logs.length
                const latestLog = block.workout_logs[block.workout_logs.length - 1]
                const exerciseName = block.exercises?.name || 'Ejercicio'
                exerciseLogs.push({
                    exerciseName,
                    targetWeight: block.target_weight_kg,
                    targetReps: block.reps,
                    actualWeight: latestLog.weight_kg,
                    actualReps: latestLog.reps_done,
                    rpe: latestLog.rpe
                })
            }
        })
        
        return {
            id: plan.id,
            title: plan.title,
            date: plan.assigned_date,
            hasInteracted: completedSets > 0,
            logCount: completedSets,
            totalSets: totalSets,
            exerciseLogs: exerciseLogs
        }
    }).filter(p => p.hasInteracted)

    return (
        <div className="max-w-[1600px] animate-fade-in mx-auto mb-24 md:mb-0 space-y-10">
            {/* Nav & Header Section */}
            <div className="space-y-6">
                <Link href="/coach/clients"
                    className="group inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-primary transition-all">
                    <div className="p-1.5 rounded-full bg-secondary dark:bg-white/5 group-hover:bg-primary/10 transition-colors">
                        <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                    </div>
                    Directorio de Unidades
                </Link>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8 relative">
                    <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none z-0" />
                    
                    <div className="flex items-center gap-4 md:gap-6 relative z-10">
                        <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center flex-shrink-0 shadow-2xl group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="text-2xl md:text-4xl font-black text-foreground uppercase font-display relative z-10">
                                {client.full_name[0]}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                                <h1 className="text-2xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display leading-none truncate">
                                    {client.full_name}
                                </h1>
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black text-[10px] uppercase tracking-widest px-2 md:px-3 py-0.5 md:py-1">Online</Badge>
                            </div>
                            <p className="text-muted-foreground text-[10px] md:text-sm font-bold uppercase tracking-widest mt-1 md:mt-3 flex items-center gap-2 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                                <span className="truncate">{client.email}</span>
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex flex-row items-center gap-3 md:gap-4 relative z-10">
                        <GlassButton asChild className="flex-1 md:flex-none h-12 md:h-14 px-4 md:px-8 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10">
                            <Link href={`/coach/nutrition-builder/${clientId}${nutritionPlans.length > 0 ? `?planId=${nutritionPlans[0].id}` : ''}`}>
                                <Apple className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 text-emerald-500" />
                                <span className="font-bold uppercase tracking-widest text-[10px] md:text-xs">Plan Dieta</span>
                            </Link>
                        </GlassButton>
                        <GlassButton asChild className="flex-1 md:flex-none h-12 md:h-14 px-4 md:px-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(0,122,255,0.5)] border-none">
                            <Link href={`/coach/builder/${clientId}`}>
                                <Zap className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3" />
                                <span className="font-bold uppercase tracking-widest text-[10px] md:text-xs">Nuevo Protocolo</span>
                            </Link>
                        </GlassButton>
                    </div>
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 relative z-10">
                {[
                    { label: 'Peso Actual', value: '72.4', unit: 'kg', icon: Activity, trend: '-0.6kg', trendUp: false },
                    { label: 'Adherencia', value: '84', unit: '%', icon: Target, trend: '+4%', trendUp: true },
                    { label: 'Días Activo', value: '24', unit: 'd', icon: Clock, trend: 'Fase 2', trendUp: true },
                    { label: 'RPE Promedio', value: '7.5', unit: '', icon: Dumbbell, trend: 'Estable', trendUp: true },
                ].map((metric, i) => (
                    <GlassCard key={i} className="p-4 md:p-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 md:w-24 h-16 md:h-24 bg-primary/5 blur-2xl rounded-full -mr-8 md:-mr-12 -mt-8 md:-mt-12 group-hover:bg-primary/10 transition-colors" />
                        <div className="flex items-start justify-between mb-4 md:mb-6">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <metric.icon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                            </div>
                            <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest px-1.5 md:px-2 py-0.5 md:py-1 rounded-md ${metric.trendUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {metric.trend}
                            </span>
                        </div>
                        <div className="flex items-end gap-1 md:gap-1.5">
                            <span className="text-2xl md:text-4xl font-black text-foreground font-display leading-none">{metric.value}</span>
                            <span className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-0.5 md:mb-1">{metric.unit}</span>
                        </div>
                        <p className="text-[8px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-2 md:mt-3 leading-none">{metric.label}</p>
                    </GlassCard>
                ))}
            </div>

            {/* Main Content Sections */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-10 relative z-10">
                
                {/* Left Column: Programs & Nutrition (8 cols) */}
                <div className="xl:col-span-8 space-y-6 md:space-y-10">
                    
                    {/* Active Status Banner */}
                    {activeProgram && (() => {
                        const remainingDays = calculateRemainingDays(activeProgram.start_date, activeProgram.weeks_to_repeat);
                        return (
                            <GlassCard className="p-1 border-primary/20 bg-primary/5">
                                <div className="flex flex-col sm:flex-row items-center justify-between p-4 md:p-6 gap-4">
                                    <div className="flex items-center gap-4 md:gap-6 w-full sm:w-auto">
                                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0">
                                            <Calendar className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-lg md:text-xl font-black text-foreground uppercase tracking-tight font-display truncate">{activeProgram.name}</h3>
                                            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1">
                                                <p className="text-[8px] md:text-[10px] text-primary font-black uppercase tracking-[0.2em]">Protocolo Activo</p>
                                                <span className="hidden md:block w-1 h-1 rounded-full bg-muted-foreground/30" />
                                                <p className="text-[8px] md:text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">{activeProgram.weeks_to_repeat} Semanas de Ciclo</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto px-2 sm:px-0">
                                        <span className="text-3xl md:text-4xl font-black text-primary font-display leading-none">
                                            {remainingDays !== null ? (remainingDays > 0 ? remainingDays : 0) : '∞'}
                                        </span>
                                        <p className="text-[8px] md:text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Días Restantes</p>
                                    </div>
                                </div>
                            </GlassCard>
                        );
                    })()}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                        {/* Training Module */}
                        <div className="space-y-4 md:space-y-6">
                            <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                Entrenamiento
                            </h2>
                            <GlassCard className="overflow-hidden bg-white/50 dark:bg-zinc-950/30">
                                <div className="p-6 md:p-8 space-y-6 md:space-y-8">
                                    {!activeProgram ? (
                                        <div className="text-center py-6 md:py-10">
                                            <Dumbbell className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                            <p className="text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sin Protocolo Activo</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 md:space-y-8">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] md:text-[10px] font-black text-primary uppercase tracking-[0.2em]">Siguiente Sesión</p>
                                                    <p className="text-base md:text-lg font-black text-foreground uppercase">Push Day: Hipertrofia</p>
                                                </div>
                                                <GlassButton size="icon" variant="ghost" className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl border border-primary/10">
                                                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                                                </GlassButton>
                                            </div>
                                            
                                            <div className="space-y-3 md:space-y-4">
                                                <p className="text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-widest">Contenido del Ciclo</p>
                                                <div className="space-y-2 md:space-y-3">
                                                    {[1, 2, 3, 4].map(i => (
                                                        <div key={i} className="flex items-center justify-between p-3 md:p-4 rounded-lg md:rounded-xl bg-white/50 dark:bg-white/[0.02] border border-border dark:border-white/5 group hover:border-primary/30 transition-all cursor-pointer">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-5 h-5 md:w-6 md:h-6 rounded bg-secondary dark:bg-white/5 flex items-center justify-center text-[9px] md:text-[10px] font-bold text-muted-foreground group-hover:text-primary transition-colors">{i}</div>
                                                                <span className="text-[10px] md:text-xs font-bold text-foreground">Plan de Sesión 0{i}</span>
                                                            </div>
                                                            <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:text-primary transition-all" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </div>

                        {/* Nutrition Module */}
                        <div className="space-y-4 md:space-y-6">
                            <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                Nutrición
                            </h2>
                            <GlassCard className="overflow-hidden bg-white/50 dark:bg-zinc-950/30">
                                <div className="p-6 md:p-8 space-y-6 md:space-y-8">
                                    {nutritionPlans.length === 0 ? (
                                        <div className="text-center py-6 md:py-10">
                                            <Apple className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                            <p className="text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sin Dieta Base</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 md:space-y-8">
                                            {nutritionPlans.map(plan => (
                                                <div key={plan.id} className="space-y-6 md:space-y-8">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1 min-w-0">
                                                            <p className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Protocolo Actual</p>
                                                            <p className="text-base md:text-lg font-black text-foreground uppercase truncate">{plan.name}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-lg md:text-xl font-black text-foreground leading-none">{plan.daily_calories || 0}</p>
                                                            <p className="text-[8px] md:text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-1">Kcal/Día</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 md:gap-3">
                                                        {[
                                                            { label: 'PRO', val: plan.protein_g, color: 'emerald' },
                                                            { label: 'CAR', val: plan.carbs_g, color: 'emerald' },
                                                            { label: 'FAT', val: plan.fats_g, color: 'emerald' },
                                                        ].map((macro, idx) => (
                                                            <div key={idx} className="bg-white/50 dark:bg-white/[0.02] border border-border dark:border-white/10 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-col items-center gap-1">
                                                                <span className="text-[8px] md:text-[9px] font-black text-muted-foreground uppercase tracking-widest">{macro.label}</span>
                                                                <span className="text-xs md:text-sm font-black text-foreground">{macro.val || 0}g</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                        <div className="flex items-center justify-between mb-2 md:mb-3">
                                                            <span className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest">Adherencia</span>
                                                            <span className="text-[9px] md:text-[10px] font-black text-emerald-500">75%</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 w-[75%] shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </div>
                    </div>

                    {/* Workout History Details */}
                    <div className="space-y-4 md:space-y-6">
                        <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            Historial de Operaciones
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            {workoutHistory.slice(0, 4).map((log: any) => (
                                <GlassCard key={log.id} className="p-5 md:p-6 bg-white/40 dark:bg-zinc-950/20 group hover:bg-white/60 dark:hover:bg-zinc-950/40 transition-all">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                <Activity className="w-4 h-4 md:w-5 md:h-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-tight truncate">{log.title}</p>
                                                <p className="text-[8px] md:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                                                    {new Date(log.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[8px] md:text-[9px] font-black uppercase tracking-widest border shrink-0 ${log.logCount >= log.totalSets ? 'bg-primary/10 text-primary border-primary/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                            {log.logCount}/{log.totalSets} Sets
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 md:space-y-2 mt-4">
                                        {log.exerciseLogs.slice(0, 2).map((ex: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between text-[9px] md:text-[10px] font-bold">
                                                <span className="text-muted-foreground uppercase truncate pr-4">{ex.exerciseName}</span>
                                                <span className="text-foreground shrink-0">{ex.actualWeight}kg × {ex.actualReps}</span>
                                            </div>
                                        ))}
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Check-ins & Biometrics (4 cols) */}
                <div className="xl:col-span-4 space-y-6 md:space-y-10">
                    
                    {/* Progress Photos Quick Glance */}
                    <div className="space-y-4 md:space-y-6">
                        <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-cyan-400" />
                            Evolución Visual
                        </h2>
                        <GlassCard className="p-4 md:p-6 space-y-4 md:space-y-6">
                            <div className="grid grid-cols-2 gap-3 md:gap-4">
                                <div className="aspect-[3/4] rounded-xl md:rounded-2xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 flex flex-col items-center justify-center overflow-hidden relative group">
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                        <span className="text-[8px] md:text-[10px] font-black text-white uppercase tracking-widest">Ver Inicial</span>
                                    </div>
                                    <p className="text-[8px] md:text-[9px] font-black text-muted-foreground uppercase tracking-widest absolute bottom-3 z-10">Día 1</p>
                                </div>
                                <div className="aspect-[3/4] rounded-xl md:rounded-2xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 flex flex-col items-center justify-center overflow-hidden relative group">
                                    <div className="absolute inset-0 bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                        <span className="text-[8px] md:text-[10px] font-black text-white uppercase tracking-widest">Ver Actual</span>
                                    </div>
                                    <p className="text-[8px] md:text-[9px] font-black text-primary uppercase tracking-widest absolute bottom-3 z-10">Semana 8</p>
                                </div>
                            </div>
                            <GlassButton className="w-full h-10 md:h-12 text-[8px] md:text-[10px] font-black uppercase tracking-widest border-primary/20">
                                Comparativa de Fotos
                            </GlassButton>
                        </GlassCard>
                    </div>

                    {/* Recent Check-ins Terminal */}
                    <div className="space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                Check-ins
                            </h2>
                            <Badge variant="outline" className="font-black text-[8px] md:text-[9px] uppercase tracking-widest bg-white/5">{checkIns?.length || 0}</Badge>
                        </div>
                        <div className="space-y-3 md:space-y-4">
                            {!checkIns || checkIns.length === 0 ? (
                                <GlassCard className="p-6 md:p-8 text-center border-dashed border-white/10">
                                    <p className="text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-widest">Esperando Reportes...</p>
                                </GlassCard>
                            ) : (
                                checkIns.slice(0, 3).map(checkIn => (
                                    <GlassCard key={checkIn.id} className="overflow-hidden group hover:border-primary/30 transition-all">
                                        <CheckInCard
                                            date={checkIn.created_at}
                                            weight={checkIn.weight}
                                            energyLevel={checkIn.energy_level}
                                            notes={checkIn.notes}
                                            photoUrl={checkIn.front_photo_url}
                                        />
                                    </GlassCard>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
