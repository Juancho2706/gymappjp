import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, CheckCircle, Clock, Link as LinkIcon } from 'lucide-react'
import { ClientsHeader } from './ClientsHeader'
import { DeleteClientButton } from './DeleteClientButton'
import type { Client } from '@/lib/database.types'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Alumnos | OmniCoach OS',
}

function StatusBadge({ forceChange }: { forceChange: boolean }) {
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

    const { data: coachData } = await supabase
        .from('coaches')
        .select('slug')
        .eq('id', user.id)
        .maybeSingle()

    const coach = coachData as { slug: string } | null

    const { data: rawClients } = await supabase
        .from('clients')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

    const clients = (rawClients ?? []) as Client[]

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    return (
        <div className="p-8 max-w-6xl animate-fade-in">
            <ClientsHeader />

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4 mb-8">
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
                        className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm"
                    >
                        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-5 h-5 ${color}`} />
                        </div>
                        <div>
                            <p
                                className="text-2xl font-extrabold text-foreground"
                                style={{ fontFamily: 'var(--font-outfit)' }}
                            >
                                {value}
                            </p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Clients table */}
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
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-6 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Alumno
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Estado
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Miembro desde
                                </th>
                                {coach && (
                                    <th className="px-6 py-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Link de acceso
                                    </th>
                                )}
                                <th className="px-6 py-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {clients.map((client) => (
                                <tr
                                    key={client.id}
                                    className="hover:bg-muted/50 transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                                <span className="text-sm font-bold text-primary">
                                                    {client.full_name[0].toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">
                                                    {client.full_name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {client.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge forceChange={client.force_password_change} />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-muted-foreground">
                                        {new Date(client.created_at).toLocaleDateString('es-AR', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                    </td>
                                    {coach && (
                                        <td className="px-6 py-4">
                                            <a
                                                href={`${appUrl}/c/${coach.slug}/login`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity"
                                            >
                                                <LinkIcon className="w-3 h-3" />
                                                /c/{coach.slug}/login
                                            </a>
                                        </td>
                                    )}
                                    <td className="px-6 py-4 text-right">
                                        <DeleteClientButton
                                            clientId={client.id}
                                            clientName={client.full_name}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
