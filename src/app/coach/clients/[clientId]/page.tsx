import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Calendar, Dumbbell, Apple, Pencil } from 'lucide-react'
import type { Client, WorkoutPlan, CheckIn, NutritionPlan } from '@/lib/database.types'
import type { Metadata } from 'next'
import { DeletePlanButton } from './DeletePlanButton'
import { CheckInCard } from '@/components/coach/CheckInCard'

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

    const { data: rawClient } = await (supabase as any)
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Client

    const { data: rawPlans } = await supabase
        .from('workout_plans')
        .select('*')
        .eq('client_id', clientId)
        .order('assigned_date', { ascending: false })

    const plans = (rawPlans ?? []) as WorkoutPlan[]

    const { data: rawNutrition } = await (supabase as any)
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    const nutritionPlans = (rawNutrition ?? []) as NutritionPlan[]

    // Fetch today's adherence
    const today = new Date().toISOString().split('T')[0]
    const { data: rawDailyLog } = await (supabase as any)
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
        <div className="max-w-5xl animate-fade-in mx-auto mb-24 md:mb-0">
            {/* Back nav */}
            <Link href="/coach/clients"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a Alumnos
            </Link>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl font-bold text-primary">
                            {client.full_name[0].toUpperCase()}
                        </span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-foreground">
                            {client.full_name}
                        </h1>
                        <p className="text-muted-foreground text-sm">{client.email}</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/coach/nutrition-builder/${clientId}`}
                        className="flex items-center gap-2 px-5 py-2.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-bold rounded-xl transition-all shadow-md">
                        <Apple className="w-4 h-4" />
                        Plan Nutricional
                    </Link>
                    <Link href={`/coach/builder/${clientId}`}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/20">
                        <Plus className="w-4 h-4" />
                        Nueva Rutina
                    </Link>
                </div>
            </div>

            {/* Intake Profile Card */}
            {(() => {
                const fetchIntake = async () => {
                    const { data } = await (supabase as any)
                        .from('client_intake')
                        .select('*')
                        .eq('client_id', clientId)
                        .maybeSingle()
                    return data
                }
                return fetchIntake()
            })().then(intake => intake && (
                <div className="bg-card border border-border rounded-2xl p-6 mb-12 shadow-sm">
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Perfil del Alumno</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Peso</p>
                            <p className="font-semibold">{intake.weight_kg} kg</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Estatura</p>
                            <p className="font-semibold">{intake.height_cm} cm</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
                            <p className="font-semibold">{intake.goals}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Nivel</p>
                            <p className="font-semibold">{intake.experience_level}</p>
                        </div>
                    </div>
                    {(intake.injuries || intake.medical_conditions) && (
                        <div className="mt-6 pt-6 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-6">
                            {intake.injuries && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Lesiones</p>
                                    <p className="text-sm">{intake.injuries}</p>
                                </div>
                            )}
                            {intake.medical_conditions && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Condiciones Médicas</p>
                                    <p className="text-sm">{intake.medical_conditions}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
                {/* Column 1: Routines & Nutrition */}
                <div className="space-y-10">
                    
                    {/* Resumen de Actividad Reciente (Coach View) */}
                    <div>
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-between">
                            <span>Actividad Reciente (Workouts)</span>
                        </h2>
                        {workoutHistory.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center">
                                <p className="text-muted-foreground text-sm">El alumno aún no ha registrado entrenamientos.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {workoutHistory.slice(0, 5).map((log: any) => (
                                    <div key={log.id} className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                    <Dumbbell className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm">{log.title}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(log.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border 
                                                    ${log.logCount >= log.totalSets ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                                                    {log.logCount} / {log.totalSets} series
                                                </span>
                                            </div>
                                        </div>

                                        {/* Detalle de pesos levantados */}
                                        {log.exerciseLogs.length > 0 && (
                                            <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border/50">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">Desempeño Destacado</p>
                                                {log.exerciseLogs.slice(0, 3).map((exLog: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between text-xs">
                                                        <span className="font-medium text-foreground truncate pr-4">{exLog.exerciseName}</span>
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            <span className="text-muted-foreground">
                                                                Sugerido: {exLog.targetWeight || '-'}kg
                                                            </span>
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                Real: {exLog.actualWeight || '-'}kg × {exLog.actualReps || '-'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {log.exerciseLogs.length > 3 && (
                                                    <p className="text-[10px] text-muted-foreground text-center mt-2 pt-2 border-t border-border/50">
                                                        + {log.exerciseLogs.length - 3} ejercicios más
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Nutrition Section */}
                    <div>
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-between">
                            <span>Plan Nutricional</span>
                            <Link href={`/coach/nutrition-builder/${clientId}`} className="text-xs text-secondary hover:opacity-80 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Nuevo
                            </Link>
                        </h2>

                        {nutritionPlans.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                                <Apple className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm mb-4">Sin plan nutricional activo</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {nutritionPlans.map(plan => (
                                    <div key={plan.id} className="bg-card border border-emerald-500/20 rounded-2xl p-5 shadow-sm">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                                <Apple className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold">{plan.name}</h3>
                                                {plan.daily_calories && (
                                                    <p className="text-xs font-semibold text-emerald-500">
                                                        {plan.daily_calories} Kcal Diarias
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {(plan.protein_g || plan.carbs_g || plan.fats_g) && (
                                            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                                <div className="bg-muted rounded-lg p-2">
                                                    <p className="text-[10px] text-muted-foreground uppercase">Protes</p>
                                                    <p className="font-bold text-sm">{plan.protein_g || 0}g</p>
                                                </div>
                                                <div className="bg-muted rounded-lg p-2">
                                                    <p className="text-[10px] text-muted-foreground uppercase">Carbs</p>
                                                    <p className="font-bold text-sm">{plan.carbs_g || 0}g</p>
                                                </div>
                                                <div className="bg-muted rounded-lg p-2">
                                                    <p className="text-[10px] text-muted-foreground uppercase">Grasas</p>
                                                    <p className="font-bold text-sm">{plan.fats_g || 0}g</p>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {plan.instructions && (
                                            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                                <strong>Notas:</strong> {plan.instructions}
                                            </div>
                                        )}

                                        {todayLog && todayLog.plan_id === plan.id && (
                                            <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Registro de Hoy</h4>
                                                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                                                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                                        {todayLog.nutrition_meal_logs?.filter((l: any) => l.is_completed).length || 0} comidas completadas
                                                    </span>
                                                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-500 bg-emerald-500/20 px-2 py-1 rounded-md">
                                                        Al día
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Workout Plans */}
                    <div>
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-between">
                            <span>Rutinas ({plans.length})</span>
                            <Link href={`/coach/builder/${clientId}`} className="text-xs text-primary hover:opacity-80 flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Nueva
                            </Link>
                        </h2>

                        {plans.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                                <Dumbbell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm mb-4">Sin rutinas asignadas</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {plans.map(plan => (
                                    <div key={plan.id}
                                        className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-primary/20 transition-colors shadow-sm">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                                            <Dumbbell className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-foreground truncate">{plan.title}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Link 
                                                href={`/coach/builder/${clientId}?planId=${plan.id}`}
                                                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                title="Editar rutina"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Link>
                                            <DeletePlanButton planId={plan.id} clientId={clientId} planTitle={plan.title} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Column 2: Check-ins */}
                <div>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">
                        Historial de Check-ins ({checkIns?.length || 0})
                    </h2>

                    {!checkIns || checkIns.length === 0 ? (
                        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                            <Calendar className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm">El alumno aún no ha enviado reportes.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {checkIns.map(checkIn => (
                                <CheckInCard
                                    key={checkIn.id}
                                    date={checkIn.created_at}
                                    weight={checkIn.weight}
                                    energyLevel={checkIn.energy_level}
                                    notes={checkIn.notes}
                                    photoUrl={checkIn.front_photo_url}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
