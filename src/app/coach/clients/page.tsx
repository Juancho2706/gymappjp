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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                <Clock className="w-3 h-3" />
                Pausado
            </span>
        )
    }
    if (forceChange) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                <Clock className="w-3 h-3" />
                Pendiente de acceso
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <CheckCircle className="w-3 h-3" />
            Activo
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
        <div className="max-w-6xl animate-fade-in mb-24 md:mb-0">
            <ClientsHeader coachSlug={coach?.slug} appUrl={appUrl} />

            {/* Stats bar */}
            <div className="flex overflow-x-auto pb-4 mb-4 md:grid md:grid-cols-3 md:gap-4 md:mb-8 md:overflow-visible hide-scrollbar snap-x">
                {[
                    {
                        label: 'Total alumnos',
                        value: clients.length,
                        icon: Users,
                        color: 'text-primary',
                        bg: 'bg-primary/10',
                    },
                    {
                        label: 'Activos',
                        value: clients.filter((c) => !c.force_password_change).length,
                        icon: CheckCircle,
                        color: 'text-emerald-600 dark:text-emerald-400',
                        bg: 'bg-emerald-100 dark:bg-emerald-500/10',
                    },
                    {
                        label: 'Pendientes de acceso',
                        value: clients.filter((c) => c.force_password_change).length,
                        icon: Clock,
                        color: 'text-amber-600 dark:text-amber-400',
                        bg: 'bg-amber-100 dark:bg-amber-500/10',
                    },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div
                        key={label}
                        className="bg-card border border-border rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4 shadow-sm min-w-[160px] flex-shrink-0 snap-start mr-4 md:mr-0 last:mr-0"
                    >
                        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div>
                            <p
                                className="text-2xl font-extrabold text-foreground leading-none mb-1"
                                style={{ fontFamily: 'var(--font-outfit)' }}
                            >
                                {value}
                            </p>
                            <p className="text-xs text-muted-foreground whitespace-nowrap">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Clients list/table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                {clients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                            <Users className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <h3 className="text-foreground font-medium mb-1">
                            Aún no tienes alumnos
                        </h3>
                        <p className="text-muted-foreground text-sm max-w-xs">
                            Haz clic en &quot;Nuevo Alumno&quot; para crear tu primer cliente. Se
                            generará una cuenta que podrá acceder a tu app personalizada.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 md:p-6 bg-transparent md:bg-card border-none md:border md:border-border rounded-2xl shadow-none md:shadow-sm">
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
                                    className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow group relative"
                                >
                                    {/* Cabecera Tarjeta: Avatar y Nombre */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                                <span className="text-lg font-bold text-primary">
                                                    {client.full_name[0].toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <a href={`/coach/clients/${client.id}`} className="block hover:underline truncate">
                                                    <h3 className="text-base font-bold text-foreground truncate">
                                                        {client.full_name}
                                                    </h3>
                                                </a>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {client.email}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Indicadores: Estado y Suscripción */}
                                    <div className="flex flex-col gap-2 mt-1">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge forceChange={client.force_password_change} isActive={client.is_active} />
                                            {subscriptionDaysRemaining !== null && (
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${subscriptionDaysRemaining <= 5 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                                                    {subscriptionDaysRemaining > 0 ? `${subscriptionDaysRemaining} días de mensualidad` : 'Mensualidad vencida'}
                                                </span>
                                            )}
                                        </div>

                                        {(() => {
                                            const activeProgram = client.workout_programs?.find(p => p.is_active);
                                            if (!activeProgram) return null;
                                            
                                            const remainingDays = calculateRemainingDays(activeProgram.start_date, activeProgram.weeks_to_repeat);
                                            if (remainingDays === null) return null;

                                            return (
                                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/5 border border-primary/10 w-fit px-2 py-0.5 rounded-full mt-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {remainingDays > 0 
                                                        ? `Quedan ${remainingDays} días de "${activeProgram.name}"`
                                                        : remainingDays === 0 ? 'Último día de plan' : 'Plan finalizado'}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Separador */}
                                    <div className="h-px bg-border w-full mt-1 mb-1"></div>

                                    {/* Acciones */}
                                    <div className="flex items-center justify-between gap-2">
                                        {client.phone && loginUrl ? (
                                            <a
                                                href={whatsappLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 rounded-lg text-xs font-semibold transition-colors"
                                            >
                                                <span>💬</span> Enviar link
                                            </a>
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground/50 italic px-2">Sin WhatsApp</span>
                                        )}

                                        <div className="flex items-center gap-1 ml-auto">
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
