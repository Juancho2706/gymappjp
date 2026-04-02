import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Calendar, Dumbbell, Apple, Pencil, Activity } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { Badge } from '@/components/ui/badge'

type Client = Tables<'clients'>
type CheckIn = Tables<'check_ins'>
type NutritionPlan = Tables<'nutrition_plans'>
import type { Metadata } from 'next'
import { CheckInCard } from '@/components/coach/CheckInCard'
import { calculateRemainingDays } from '@/lib/utils'

export const metadata: Metadata = { title: 'Alumno | OmniCoach OS' }

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

    // Fetch today's adherence
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

    // Fetch workout history logs detailed
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

    // Process workout history: calculate completion percentage for recent plans
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
                
                // Extraemos detalles del ultimo registro para mostrar progreso
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
        <div className="max-w-7xl animate-fade-in mx-auto mb-24 md:mb-0 space-y-8">
            {/* Back nav */}
            <Link href="/coach/clients"
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors mb-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl hover:bg-white/10">
                <ArrowLeft className="w-3.5 h-3.5" />
                Terminal Central
            </Link>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl rounded-full -z-10 pointer-events-none" />
                
                <div className="flex items-center gap-5 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(0,122,255,0.2)]">
                        <span className="text-3xl font-bold text-white uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                            {client.full_name[0]}
                        </span>
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white uppercase tracking-tighter" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                            {client.full_name}
                        </h1>
                        <p className="text-primary text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{client.email}</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 relative z-10">
                    <Link href={`/coach/nutrition-builder/${clientId}`}
                        className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-md border border-white/10">
                        <Apple className="w-4 h-4 text-emerald-400" />
                        Plan Nutricional
                    </Link>
                    <Link href={`/coach/builder/${clientId}`}
                        className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(0,122,255,0.4)] border border-primary">
                        <Plus className="w-4 h-4" />
                        Nuevo Protocolo
                    </Link>
                </div>
            </div>

            {/* Plan Duration Badge */}
            {activeProgram && (() => {
                const remainingDays = calculateRemainingDays(activeProgram.start_date, activeProgram.weeks_to_repeat);
                if (remainingDays === null) return null;
                
                return (
                    <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500 shadow-[0_0_15px_rgba(0,122,255,0.1)]">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                            <Calendar className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-widest">
                                {remainingDays > 0 
                                    ? `Ciclo Activo: ${remainingDays} días restantes`
                                    : remainingDays === 0 
                                        ? `Último Día de Protocolo`
                                        : `Protocolo Finalizado`}
                            </p>
                            <p className="text-[10px] text-primary uppercase font-bold tracking-[0.2em] mt-0.5">
                                {activeProgram.name}
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* Intake Profile Card */}
            {(() => {
                const fetchIntake = async () => {
                    const { data } = await supabase
                        .from('client_intake')
                        .select('*')
                        .eq('client_id', clientId)
                        .maybeSingle()
                    return data
                }
                return fetchIntake()
            })().then(intake => intake && (
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary" />
                        Biometría Base
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Masa</p>
                            <p className="text-lg font-bold text-white">{intake.weight_kg} <span className="text-xs text-zinc-500">kg</span></p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Estatura</p>
                            <p className="text-lg font-bold text-white">{intake.height_cm} <span className="text-xs text-zinc-500">cm</span></p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Target</p>
                            <p className="text-sm font-bold text-white uppercase truncate">{intake.goals}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Nivel</p>
                            <p className="text-sm font-bold text-white uppercase truncate">{intake.experience_level}</p>
                        </div>
                    </div>
                    {(intake.injuries || intake.medical_conditions) && (
                        <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {intake.injuries && (
                                <div>
                                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-[0.2em] mb-2">Lesiones Reportadas</p>
                                    <p className="text-xs text-zinc-300 font-medium leading-relaxed">{intake.injuries}</p>
                                </div>
                            )}
                            {intake.medical_conditions && (
                                <div>
                                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-[0.2em] mb-2">Condiciones Médicas</p>
                                    <p className="text-xs text-zinc-300 font-medium leading-relaxed">{intake.medical_conditions}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Column 1: Routines & Nutrition */}
                <div className="space-y-8">
                    
                    {/* Workout Programs */}
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                            <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Dumbbell className="w-4 h-4 text-primary" />
                                Módulo de Entrenamiento
                            </h2>
                        </div>

                        <div className="p-6">
                            {!activeProgram ? (
                                <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
                                    <Dumbbell className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Sin protocolo activo</p>
                                </div>
                            ) : (
                                <div className="border border-primary/20 bg-primary/5 rounded-xl p-6 relative overflow-hidden group hover:border-primary/40 transition-colors">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-2xl rounded-full -z-10" />
                                    <div className="flex items-center justify-between mb-6">
                                        <div>
                                            <h3 className="font-bold text-white text-lg uppercase tracking-tight">{activeProgram.name}</h3>
                                            <p className="text-[10px] text-primary font-bold uppercase tracking-[0.2em] mt-1">
                                                Protocolo Maestro
                                            </p>
                                        </div>
                                        <Link 
                                            href={`/coach/builder/${clientId}?programId=${activeProgram.id}`}
                                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-primary hover:border-primary/30 transition-all"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Link>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-black/50 border border-white/5 rounded-lg p-3">
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Duración</p>
                                            <p className="font-bold text-white text-sm">{activeProgram.weeks_to_repeat} Semanas</p>
                                        </div>
                                        <div className="bg-black/50 border border-white/5 rounded-lg p-3">
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Volumen</p>
                                            <p className="font-bold text-white text-sm">{(activeProgram as any).workout_plans?.length || 0} Sesiones</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Nutrition Section */}
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                            <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Apple className="w-4 h-4 text-emerald-500" />
                                Módulo Nutricional
                            </h2>
                        </div>

                        <div className="p-6">
                            {nutritionPlans.length === 0 ? (
                                <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
                                    <Apple className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Sin plan nutricional</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {nutritionPlans.map(plan => (
                                        <div key={plan.id} className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-6 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-2xl rounded-full -z-10" />
                                            <div className="flex items-start justify-between mb-6">
                                                <div>
                                                    <h3 className="font-bold text-white text-lg uppercase tracking-tight">{plan.name}</h3>
                                                    {plan.daily_calories && (
                                                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mt-1">
                                                            Target: {plan.daily_calories} Kcal
                                                        </p>
                                                    )}
                                                </div>
                                                <Link 
                                                    href={`/coach/nutrition-builder/${clientId}?planId=${plan.id}`}
                                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Link>
                                            </div>
                                            
                                            {(plan.protein_g || plan.carbs_g || plan.fats_g) && (
                                                <div className="grid grid-cols-3 gap-3 mb-4">
                                                    <div className="bg-black/50 border border-white/5 rounded-lg p-3 flex flex-col items-center">
                                                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">PRO</p>
                                                        <p className="font-bold text-white text-sm">{plan.protein_g || 0}g</p>
                                                    </div>
                                                    <div className="bg-black/50 border border-white/5 rounded-lg p-3 flex flex-col items-center">
                                                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">CAR</p>
                                                        <p className="font-bold text-white text-sm">{plan.carbs_g || 0}g</p>
                                                    </div>
                                                    <div className="bg-black/50 border border-white/5 rounded-lg p-3 flex flex-col items-center">
                                                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">FAT</p>
                                                        <p className="font-bold text-white text-sm">{plan.fats_g || 0}g</p>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {plan.instructions && (
                                                <div className="text-xs text-zinc-400 bg-black/40 border border-white/5 p-4 rounded-lg font-medium leading-relaxed">
                                                    <span className="text-emerald-500 font-bold uppercase tracking-widest text-[10px] block mb-1">Notas</span>
                                                    {plan.instructions}
                                                </div>
                                            )}

                                            {todayLog && todayLog.plan_id === plan.id && (
                                                <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                                            {todayLog.nutrition_meal_logs?.filter((l: any) => l.is_completed).length || 0} Meals
                                                        </span>
                                                        <span className="text-[10px] uppercase font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded">
                                                            Tracking OK
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Column 2: Logs & Check-ins */}
                <div className="space-y-8">
                    {/* Workout History */}
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 bg-white/[0.02]">
                            <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />
                                Logs de Entrenamiento
                            </h2>
                        </div>
                        
                        <div className="p-6">
                            {workoutHistory.length === 0 ? (
                                <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
                                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Sin registros recientes</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {workoutHistory.slice(0, 5).map((log: any) => (
                                        <div key={log.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Dumbbell className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm uppercase tracking-tight">{log.title}</p>
                                                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                                                            {new Date(log.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest
                                                    ${log.logCount >= log.totalSets ? 'bg-primary/10 text-primary border-primary/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                                    {log.logCount}/{log.totalSets} SETS
                                                </div>
                                            </div>

                                            {log.exerciseLogs.length > 0 && (
                                                <div className="bg-black/50 rounded-lg p-4 border border-white/5 space-y-3">
                                                    {log.exerciseLogs.slice(0, 3).map((exLog: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between">
                                                            <span className="text-xs font-bold text-zinc-300 truncate pr-4">{exLog.exerciseName}</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[10px] font-bold text-zinc-600">
                                                                    T: {exLog.targetWeight || '-'}kg
                                                                </span>
                                                                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                                                    {exLog.actualWeight || '-'}kg × {exLog.actualReps || '-'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Check-ins */}
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                            <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-primary" />
                                Base de Datos: Check-ins
                            </h2>
                            <Badge variant="outline" className="bg-white/5 text-zinc-500 border-white/10 font-bold">{checkIns?.length || 0}</Badge>
                        </div>

                        <div className="p-6">
                            {!checkIns || checkIns.length === 0 ? (
                                <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
                                    <Calendar className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Sin reportes registrados</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {checkIns.map(checkIn => (
                                        <div key={checkIn.id} className="relative group">
                                            <div className="absolute inset-0 bg-primary/5 blur-xl rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <CheckInCard
                                                date={checkIn.created_at}
                                                weight={checkIn.weight}
                                                energyLevel={checkIn.energy_level}
                                                notes={checkIn.notes}
                                                photoUrl={checkIn.front_photo_url}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
