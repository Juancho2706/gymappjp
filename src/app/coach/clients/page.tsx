import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, CheckCircle, Clock, Link as LinkIcon, Calendar } from 'lucide-react'
import { ClientsHeader } from './ClientsHeader'
import { DeleteClientButton } from './DeleteClientButton'
import { ToggleStatusButton } from './ToggleStatusButton'
import { ResetPasswordButton } from './ResetPasswordButton'
import type { Tables } from '@/lib/database.types'
import { calculateRemainingDays } from '@/lib/utils'

type Client = Tables<'clients'>
type WorkoutProgram = Tables<'workout_programs'>

interface ClientWithProgram extends Client {
    workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]
}
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Alumnos | OmniCoach OS',
}

function StatusBadge({ forceChange, isActive }: { forceChange: boolean, isActive?: boolean | null }) {
    if (isActive === false) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest bg-rose-500/10 text-rose-500 border border-rose-500/20">
                PAUSADO
            </span>
        )
    }
    if (forceChange) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">
                PENDIENTE
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
            ACTIVO
        </span>
    )
}

export default async function CoachClientsPage() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Fetch required data in parallel after auth
    const [coachResponse, clientsResponse, headersList] = await Promise.all([
        supabase.from('coaches').select('slug').eq('id', user.id).maybeSingle(),
        supabase
            .from('clients')
            .select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
            .eq('coach_id', user.id)
            .order('created_at', { ascending: false }),
        headers()
    ])

    const coach = coachResponse.data as { slug: string } | null
    const clients = (clientsResponse.data ?? []) as ClientWithProgram[]

    // Generate the correct base URL automatically from the request headers
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    return (
        <div className="max-w-[1600px] animate-fade-in mb-24 md:mb-0 space-y-8">
            <ClientsHeader coachSlug={coach?.slug} appUrl={appUrl} />

            {/* Stats bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                    {
                        label: 'Total Alumnos',
                        value: clients.length,
                        icon: Users,
                        color: 'text-zinc-400',
                        bg: 'bg-white/5',
                    },
                    {
                        label: 'Despliegues Activos',
                        value: clients.filter((c) => !c.force_password_change).length,
                        icon: CheckCircle,
                        color: 'text-primary',
                        bg: 'bg-primary/10',
                    },
                    {
                        label: 'Pendientes Sync',
                        value: clients.filter((c) => c.force_password_change).length,
                        icon: Clock,
                        color: 'text-amber-500',
                        bg: 'bg-amber-500/10',
                    },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div
                        key={label}
                        className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex items-center gap-6 shadow-2xl relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-2xl rounded-full -z-10" />
                        <div className={`w-12 h-12 rounded-xl ${bg} border border-white/5 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                            <Icon className={`w-6 h-6 ${color}`} />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white tracking-tighter" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                {value}
                            </p>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-1">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Clients list/table */}
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="px-8 py-6 border-b border-white/10 bg-white/[0.02]">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary" />
                        Directorio de Unidades
                    </h2>
                </div>

                {clients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                            <Users className="w-8 h-8 text-zinc-700" />
                        </div>
                        <h3 className="text-white font-bold uppercase tracking-widest text-sm mb-2">
                            Base de Datos Vacía
                        </h3>
                        <p className="text-zinc-500 text-xs max-w-xs font-medium">
                            No se han detectado alumnos en el sistema. Inicie una nueva alta para comenzar.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-8">
                        {clients.map((client) => {
                            let subscriptionDaysRemaining = null
                            if (client.subscription_start_date) {
                                const start = new Date(client.subscription_start_date)
                                const end = new Date(start)
                                end.setMonth(end.getMonth() + 1)
                                const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                                subscriptionDaysRemaining = diff
                            }

                            const loginUrl = coach && appUrl ? `${appUrl}/c/${coach.slug}/login` : ''
                            const whatsappLink = client.phone 
                                ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.full_name}, aquí tienes tu link de acceso a la app: ${loginUrl}`)}`
                                : '#'

                            return (
                                <div
                                    key={client.id}
                                    className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 flex flex-col gap-6 hover:border-primary/30 transition-all group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                    
                                    {/* Cabecera Tarjeta: Avatar y Nombre */}
                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/20 transition-colors">
                                            <span className="text-xl font-bold text-white uppercase" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                                {client.full_name[0]}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <a href={`/coach/clients/${client.id}`} className="block group-hover:text-primary transition-colors">
                                                <h3 className="text-base font-bold text-white uppercase tracking-tight truncate">
                                                    {client.full_name}
                                                </h3>
                                            </a>
                                            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest truncate mt-0.5">
                                                {client.email}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Indicadores: Estado y Suscripción */}
                                    <div className="space-y-3 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge forceChange={client.force_password_change} isActive={client.is_active} />
                                            {subscriptionDaysRemaining !== null && (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${subscriptionDaysRemaining <= 5 ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                                                    {subscriptionDaysRemaining > 0 ? `${subscriptionDaysRemaining} DÍAS` : 'VENCIDO'}
                                                </span>
                                            )}
                                        </div>

                                        {(() => {
                                            const activeProgram = client.workout_programs?.find(p => p.is_active);
                                            if (!activeProgram) return (
                                                <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-700 uppercase tracking-[0.2em] bg-white/[0.02] border border-white/5 w-fit px-3 py-1 rounded-md">
                                                    Sin Protocolo
                                                </div>
                                            );
                                            
                                            const remainingDays = calculateRemainingDays(activeProgram.start_date, activeProgram.weeks_to_repeat);
                                            if (remainingDays === null) return null;

                                            return (
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-primary bg-primary/5 border border-primary/10 w-fit px-3 py-1 rounded-md">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {remainingDays > 0 
                                                        ? `${remainingDays} DÍAS RESTANTES`
                                                        : remainingDays === 0 ? 'ÚLTIMO DÍA' : 'CICLO FINALIZADO'}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Acciones */}
                                    <div className="flex items-center justify-between gap-3 mt-auto pt-4 border-t border-white/5 relative z-10">
                                        {client.phone && loginUrl ? (
                                            <a
                                                href={whatsappLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                                            >
                                                SYNC PWA
                                            </a>
                                        ) : (
                                            <span className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest px-2">NO PHONE</span>
                                        )}

                                        <div className="flex items-center gap-2 ml-auto">
                                            <ResetPasswordButton
                                                clientId={client.id}
                                                clientName={client.full_name}
                                            />
                                            <ToggleStatusButton
                                                clientId={client.id}
                                                clientName={client.full_name}
                                                isActive={client.is_active !== false}
                                            />
                                            <DeleteClientButton
                                                clientId={client.id}
                                                clientName={client.full_name}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
