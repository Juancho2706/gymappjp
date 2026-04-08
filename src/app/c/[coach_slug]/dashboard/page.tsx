import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Calendar, Dumbbell, TrendingUp, ChevronRight, Apple } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'

import { ClientSettingsModal } from '@/components/client/ClientSettingsModal'

type Client = Tables<'clients'>
type WorkoutPlan = Tables<'workout_plans'>
type Coach = Tables<'coaches'>
type WorkoutProgram = Tables<'workout_programs'>
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

    // Pre-calculate dates using Santiago timezone (where the app is used)
    const tzDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })
    const userLocalDate = new Date(tzDateStr)

    const dYearToday2 = userLocalDate.getFullYear()
    const dMonthToday2 = String(userLocalDate.getMonth() + 1).padStart(2, '0')
    const dDayToday2 = String(userLocalDate.getDate()).padStart(2, '0')
    const today = `${dYearToday2}-${dMonthToday2}-${dDayToday2}`

    const thirtyDaysAgo = new Date(userLocalDate)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // day_of_week: 1=Monday, 7=Sunday (matching DB convention)
    const jsDayOfWeek = userLocalDate.getDay() // 0=Sunday, 1=Monday...
    const todayDayOfWeek = jsDayOfWeek === 0 ? 7 : jsDayOfWeek

    // Fetch everything in parallel to reduce delay
    const [
        clientResponse,
        plansResponse,
        nutritionResponse,
        checkinsResponse,
        logsResponse,
        programResponse
    ] = await Promise.all([
        supabase
            .from('clients')
            .select('id, full_name, coach_id, coaches ( brand_name, primary_color, logo_url )')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('workout_plans')
            .select('id, title, assigned_date, group_name, day_of_week, program_id, created_at')
            .eq('client_id', user.id)
            .order('assigned_date', { ascending: false }),
        supabase
            .from('nutrition_plans')
            .select('*')
            .eq('client_id', user.id)
            .eq('is_active', true)
            .maybeSingle(),
        supabase
            .from('check_ins')
            .select('created_at, weight_kg')
            .eq('client_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10),
        supabase
            .from('workout_logs')
            .select('logged_at')
            .eq('client_id', user.id)
            .gte('logged_at', thirtyDaysAgo.toISOString()),
        supabase
            .from('workout_programs')
            .select('*')
            .eq('client_id', user.id)
            .eq('is_active', true)
            .maybeSingle()
    ])

    const client = clientResponse.data as ClientWithCoach | null
    if (!client) redirect(`/c/${coach_slug}/login`)

    const activeProgram = programResponse?.data
    const allPlans = (plansResponse.data || []) as (Pick<WorkoutPlan, 'id' | 'title' | 'assigned_date' | 'group_name' | 'created_at'> & { day_of_week?: number | null, program_id?: string | null })[]
    
    // Find today's workout:
    // 1. Check for specific date match (one-off assigned)
    // 2. Check for day of week match (recurring program)
    let todayPlan = allPlans.find((p) => p.assigned_date === today)
    if (!todayPlan && activeProgram) {
        todayPlan = allPlans.find((p) => p.program_id === activeProgram.id && p.day_of_week === todayDayOfWeek)
    }

    const coachBranding = Array.isArray(client.coaches) ? client.coaches[0] : client.coaches
    
    const activeNutrition = nutritionResponse.data
    const checkIns = (checkinsResponse.data as any[])?.map(c => ({
        date: c.created_at,
        weight: c.weight_kg
    })) || []

    const uniqueWorkoutDays = new Set(
        (logsResponse.data || []).map((log: any) => new Date(log.logged_at).toISOString().split('T')[0])
    )
    const workoutsLast30Days = uniqueWorkoutDays.size

    // Group history plans by group_name
    // Exclude todayPlan and program-based plans (they go into the program section)
    const historyPlans = allPlans.filter((p) => p.id !== todayPlan?.id && !p.program_id)
    const programPlans = allPlans.filter((p) => p.program_id === activeProgram?.id).sort((a, b) => (a.day_of_week || 0) - (b.day_of_week || 0))

    const groupedHistory = historyPlans.reduce<Record<string, typeof historyPlans>>((acc, plan) => {
        const group = plan.group_name || 'Anteriores'
        if (!acc[group]) acc[group] = []
        acc[group].push(plan)
        return acc
    }, {})
    
    // Generar calendario de la semana actual (Lunes a Domingo)
    const curr = userLocalDate
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1) // Ajuste para Lunes = primer día
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(curr)
        d.setDate(firstDay + i)
        // d is now the correct date object
        // Format to YYYY-MM-DD local
        const dYear = d.getFullYear()
        const dMonth = String(d.getMonth() + 1).padStart(2, '0')
        const dDay = String(d.getDate()).padStart(2, '0')
        const dStr = `${dYear}-${dMonth}-${dDay}`
        
        const dDayOfWeek = d.getDay() === 0 ? 7 : d.getDay()

        const hasAssignedWorkout = allPlans.some(p => p.assigned_date === dStr)
        const hasProgramWorkout = activeProgram && allPlans.some(p => p.program_id === activeProgram.id && p.day_of_week === dDayOfWeek)

        return {
            dateStr: dStr,
            dayName: d.toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase(),
            dayNum: d.getDate(),
            isToday: dStr === today,
            hasWorkout: hasAssignedWorkout || hasProgramWorkout
        }
    })

    const useBrandColorsStr = (await headers()).get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest truncate">
                            {coachBranding?.brand_name}
                        </p>
                        <h1 className="text-xl font-bold text-foreground font-display truncate">
                            Hola, {client.full_name.split(' ')[0]} 👋
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {workoutsLast30Days > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20 whitespace-nowrap">
                                🔥 {workoutsLast30Days}
                            </span>
                        )}
                        <ClientSettingsModal coachSlug={coach_slug} initialUseBrandColors={initialUseBrandColors} />
                        <Link
                            href={`/c/${coach_slug}/check-in`}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors uppercase tracking-wider"
                            style={{
                                borderColor: 'var(--theme-primary)',
                                color: 'var(--theme-primary)',
                                backgroundColor: 'color-mix(in srgb, var(--theme-primary) 5%, transparent)',
                            }}
                        >
                            Check-in
                        </Link>
                    </div>
                </div>
            </header>

            <main className="px-4 py-6 space-y-6 max-w-lg mx-auto">
                {/* Calendario Semanal */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
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
                                }`}
                                style={day.isToday ? { backgroundColor: 'var(--theme-primary)' } : (day.hasWorkout ? { color: 'var(--theme-primary)', borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)', backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' } : {})}
                                >
                                    {day.dayNum}
                                </div>
                                <div className={`w-1 h-1 rounded-full ${day.hasWorkout && !day.isToday ? 'bg-primary' : 'bg-transparent'}`} style={day.hasWorkout && !day.isToday ? { backgroundColor: 'var(--theme-primary)' } : {}} />
                            </div>
                        ))}
                    </div>
                </div>

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
                        <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-md transition-all h-full flex flex-col justify-center items-center text-center">
                            <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
                            <p className="text-sm font-semibold text-foreground">Día de Descanso</p>
                            <p className="text-muted-foreground text-xs mt-1">Recupérate para tu próxima sesión.</p>
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
                            <p className="text-lg font-semibold text-foreground line-clamp-1">{(activeNutrition as any)?.name}</p>
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

                {/* Active Program Section */}
                {activeProgram && programPlans.length > 0 && (
                    <div className="mt-8 space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-primary" style={{ color: 'var(--theme-primary)' }} />
                                {activeProgram.name}
                            </h2>
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                Programa Activo
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {programPlans.map((plan) => {
                                const isPlanToday = plan.day_of_week === todayDayOfWeek
                                const dayName = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][(plan.day_of_week || 1) - 1]
                                
                                return (
                                    <Link
                                        key={plan.id}
                                        href={`/c/${coach_slug}/workout/${plan.id}`}
                                        className={`flex items-center gap-4 bg-card border shadow-sm rounded-2xl p-4 transition-all duration-200 group ${
                                            isPlanToday 
                                                ? 'ring-2 ring-offset-2 border-transparent ring-[var(--theme-primary)]' 
                                                : 'border-border hover:border-accent'
                                        }`}
                                    >
                                        <div
                                            className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 border"
                                            style={{ 
                                                backgroundColor: isPlanToday ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
                                                borderColor: isPlanToday ? 'var(--theme-primary)' : 'color-mix(in srgb, var(--theme-primary) 20%, transparent)',
                                                color: isPlanToday ? 'white' : 'var(--theme-primary)'
                                            }}
                                        >
                                            <span className="text-[10px] font-bold uppercase leading-none">{dayName.substring(0, 3)}</span>
                                            <span className="text-lg font-bold leading-none mt-0.5">{plan.day_of_week}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-bold truncate ${isPlanToday ? 'text-foreground' : 'text-foreground/80'}`}>
                                                {plan.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {dayName} • {isPlanToday ? '¡Tu entrenamiento para hoy!' : `Día ${plan.day_of_week} de tu programa`}
                                            </p>
                                        </div>
                                        <div 
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                                                isPlanToday ? 'bg-primary text-white' : 'bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground'
                                            }`}
                                            style={isPlanToday ? { backgroundColor: 'var(--theme-primary)' } : {}}
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Recent plans */}
                {historyPlans.length > 0 && (
                    <div className="mt-6 space-y-6">
                        {Object.entries(groupedHistory).map(([groupName, plansInGroup]) => (
                            <div key={groupName} className="space-y-3">
                                <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] pl-1">
                                    {groupName}
                                </h2>
                                <div className="space-y-2">
                                    {plansInGroup.map((plan) => (
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
                                                <p className="text-[10px] text-muted-foreground">
                                                    {plan.assigned_date ? (
                                                        new Date(plan.assigned_date).toLocaleDateString('es-AR', {
                                                            weekday: 'long', day: 'numeric', month: 'short'
                                                        })
                                                    ) : plan.day_of_week ? (
                                                        ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][plan.day_of_week - 1]
                                                    ) : (
                                                        new Date(plan.created_at).toLocaleDateString('es-AR', {
                                                            day: 'numeric', month: 'short', year: 'numeric'
                                                        })
                                                    )}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
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
