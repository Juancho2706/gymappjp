import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Calendar, Dumbbell } from 'lucide-react'
import type { Client, WorkoutPlan, CheckIn } from '@/lib/database.types'
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

    const { data: rawClient } = await supabase
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

    const { data: rawCheckins } = await supabase
        .from('check_ins')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    const checkIns = rawCheckins as CheckIn[] | null

    return (
        <div className="p-8 max-w-4xl animate-fade-in">
            {/* Back nav */}
            <Link href="/coach/clients"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a Alumnos
            </Link>

            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-primary">
                        {client.full_name[0].toUpperCase()}
                    </span>
                </div>
                <div className="flex-1">
                    <h1 className="text-2xl font-extrabold text-foreground">
                        {client.full_name}
                    </h1>
                    <p className="text-muted-foreground text-sm">{client.email}</p>
                </div>
                <Link href={`/coach/builder/${clientId}`}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4" />
                    Nueva Rutina
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
                {/* Column 1: Workout Plans */}
                <div>
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-between">
                        <span>Rutinas asignadas ({plans.length})</span>
                        <Link href={`/coach/builder/${clientId}`} className="text-xs text-primary hover:opacity-80 flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Nueva
                        </Link>
                    </h2>

                    {plans.length === 0 ? (
                        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                            <Dumbbell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-muted-foreground text-sm mb-4">Sin rutinas asignadas</p>
                            <Link href={`/coach/builder/${clientId}`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-xl transition-all">
                                <Plus className="w-3.5 h-3.5" />
                                Crear Rutina
                            </Link>
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
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(plan.assigned_date).toLocaleDateString('es-AR', {
                                                weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                    <DeletePlanButton planId={plan.id} clientId={clientId} planTitle={plan.title} />
                                </div>
                            ))}
                        </div>
                    )}
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
