import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Calendar, Dumbbell, TrendingUp, ChevronRight, Apple } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Client, WorkoutPlan, Coach } from '@/lib/database.types'
import { WeightProgressChart } from './WeightProgressChart'

export const metadata: Metadata = { title: 'Dashboard' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

type ClientWithCoach = Pick<Client, 'id' | 'full_name' | 'coach_id'> & {
    coaches: Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url'> | null
}

export default async function ClientDashboardPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    // Fetch client and their coach branding
    const { data: clientData } = await supabase
        .from('clients')
        .select(`
      id,
      full_name,
      coach_id,
      coaches (
        brand_name,
        primary_color,
        logo_url
      )
    `)
        .eq('id', user.id)
        .maybeSingle()

    const client = clientData as ClientWithCoach | null

    if (!client) redirect(`/c/${coach_slug}/login`)

    // Today's workout plans
    const today = new Date().toISOString().split('T')[0]
    const { data: rawPlans } = await supabase
        .from('workout_plans')
        .select('id, title, assigned_date')
        .eq('client_id', user.id)
        .order('assigned_date', { ascending: false })
        .limit(5)

    const todayPlans = rawPlans as Pick<WorkoutPlan, 'id' | 'title' | 'assigned_date'>[] | null

    const todayPlan = todayPlans?.find((p) => p.assigned_date === today)
    const coachBranding = Array.isArray(client.coaches) ? client.coaches[0] : client.coaches
    
    // Generar calendario de la semana actual (Lunes a Domingo)
    const curr = new Date()
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1) // Ajuste para Lunes = primer día
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(curr.setDate(firstDay + i))
        return {
            dateStr: d.toISOString().split('T')[0],
            dayName: d.toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase(),
            dayNum: d.getDate(),
            isToday: d.toISOString().split('T')[0] === today,
            hasWorkout: todayPlans?.some(p => p.assigned_date === d.toISOString().split('T')[0])
        }
    })

    // Fetch active nutrition plan
    const { data: rawNutrition } = await (supabase as any)
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
        
    const activeNutrition = rawNutrition

    // Fetch check-ins for weight progress chart
    const { data: rawCheckins } = await supabase
        .from('check_ins')
        .select('created_at, weight_kg')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

    const checkIns = (rawCheckins as any[])?.map(c => ({
        date: c.created_at,
        weight: c.weight_kg
    })) || []

    // Calculate Workout Gamification
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentLogs } = await supabase
        .from('workout_logs')
        .select('logged_at')
        .eq('client_id', user.id)
        .gte('logged_at', thirtyDaysAgo.toISOString()) as { data: { logged_at: string }[] | null }

    const uniqueWorkoutDays = new Set(
        (recentLogs || []).map(log => new Date(log.logged_at).toISOString().split('T')[0])
    )
    const workoutsLast30Days = uniqueWorkoutDays.size

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border px-4 py-4 flex items-center justify-between">
                <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
                        {coachBranding?.brand_name}
                    </p>
                    <div className="flex items-center gap-2">
                        <h1
                            className="text-xl font-bold text-foreground"
                            style={{ fontFamily: 'var(--font-outfit)' }}
                        >
                            Hola, {client.full_name.split(' ')[0]} 👋
                        </h1>
                        {workoutsLast30Days > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
                                🔥 {workoutsLast30Days} este mes
                            </span>
                        )}
                    </div>
                </div>
                <Link
                    href={`/c/${coach_slug}/check-in`}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                    style={{
                        borderColor: 'var(--theme-primary)',
                        color: 'var(--theme-primary)',
                    }}
                >
                    Check-in
                </Link>
            </header>

            <main className="px-4 py-6 space-y-6 max-w-lg mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Today's workout CTA */}
                    {todayPlan ? (
                        <Link
                            href={`/c/${coach_slug}/workout/${todayPlan.id}`}
                            className="block bg-card border border-border rounded-2xl p-5 hover:border-border hover:border-accent transition-all duration-200 group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center border"
                                    style={{
                                        backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)',
                                    }}
                                >
                                    <Dumbbell className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                            </div>
                            <p className="text-xs text-muted-foreground font-medium mb-1">Entrenamiento de hoy</p>
                            <p className="text-lg font-semibold text-foreground">{todayPlan.title}</p>
                            <div
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                                    color: 'var(--theme-primary)',
                                }}
                            >
                                Empezar ahora →
                            </div>
                        </Link>
                    ) : (
                        <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all h-full flex flex-col justify-center">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-semibold text-foreground">Plan Semanal</p>
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex justify-between items-center w-full max-w-sm mx-auto">
                                {weekDays.map((day, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-1.5">
                                        <span className={`text-[10px] font-bold ${day.isToday ? 'text-foreground' : 'text-muted-foreground'}`}>{day.dayName}</span>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                                            day.isToday 
                                                ? 'bg-primary text-primary-foreground shadow-sm' 
                                                : day.hasWorkout 
                                                    ? 'bg-primary/10 text-primary border border-primary/20' 
                                                    : 'text-muted-foreground'
                                        }`}>
                                            {day.dayNum}
                                        </div>
                                        <div className={`w-1 h-1 rounded-full ${day.hasWorkout && !day.isToday ? 'bg-primary' : 'bg-transparent'}`} />
                                    </div>
                                ))}
                            </div>
                            <p className="text-muted-foreground text-xs mt-4 text-center">Hoy es día de descanso activo o recuperación.</p>
                        </div>
                    )}

                    {/* Active Nutrition CTA */}
                    {activeNutrition ? (
                        <Link
                            href={`/c/${coach_slug}/nutrition`}
                            className="block bg-card border border-border rounded-2xl p-5 hover:border-border hover:border-accent transition-all duration-200 group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center border border-emerald-500/30 bg-emerald-500/10"
                                >
                                    <Apple className="w-5 h-5 text-emerald-500" />
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                            </div>
                            <p className="text-xs text-muted-foreground font-medium mb-1">Plan Nutricional</p>
                            <p className="text-lg font-semibold text-foreground line-clamp-1">{activeNutrition.name}</p>
                            <div
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-emerald-500/10 text-emerald-500"
                            >
                                Ver Detalles →
                            </div>
                        </Link>
                    ) : (
                        <div className="bg-card border border-border rounded-2xl p-6 text-center h-full flex flex-col justify-center">
                            <Apple className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm">Sin plan nutricional</p>
                            <p className="text-muted-foreground text-xs mt-1">Solicítalo a tu coach</p>
                        </div>
                    )}
                </div>

                {/* Recent plans */}
                {todayPlans && todayPlans.length > 0 && (
                    <div className="mt-6">
                        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                            Historial de rutinas
                        </h2>
                        <div className="space-y-2">
                            {todayPlans.filter((p) => p.id !== todayPlan?.id).map((plan) => (
                                <Link
                                    key={plan.id}
                                    href={`/c/${coach_slug}/workout/${plan.id}`}
                                    className="flex items-center gap-3 bg-card border border-border shadow-sm rounded-xl px-4 py-3 hover:shadow-md hover:-translate-y-0.5 hover:border-accent transition-all duration-200 group"
                                >
                                    <div
                                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
                                    >
                                        <TrendingUp className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground truncate">{plan.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(plan.assigned_date).toLocaleDateString('es-AR', {
                                                weekday: 'long', day: 'numeric', month: 'short'
                                            })}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Weight Progress Chart */}
                <div className="mt-6">
                    <WeightProgressChart data={checkIns} primaryColor={coachBranding?.primary_color || undefined} coachSlug={coach_slug} />
                </div>
            </main>
        </div>
    )
}
