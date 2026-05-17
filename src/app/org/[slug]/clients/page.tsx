import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug, getOrgClients, getOrgMembers } from '../_data/org.queries'
import { AddClientForm } from './_components/AddClientForm'
import { AssignClientSelect } from './_components/AssignClientSelect'
import { UserCheck, UserX } from 'lucide-react'

export const metadata: Metadata = { title: 'Clientes' }

interface Props {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ q?: string }>
}

export default async function OrgClientsPage({ params, searchParams }: Props) {
    const { slug } = await params
    const { q } = await searchParams

    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'

    const [clients, members] = await Promise.all([
        getOrgClients(org.id, q),
        getOrgMembers(org.id),
    ])

    const activeCoaches = members
        .filter(m => m.status === 'active' && m.coach)
        .map(m => ({ id: m.coach!.id, full_name: m.coach!.full_name, slug: m.coach!.slug }))

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Clientes</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{clients.length} clientes en el pool</p>
                </div>
            </div>

            {/* Add client form — admins only */}
            {isAdmin && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold mb-3">Agregar cliente</h2>
                    <AddClientForm orgSlug={slug} coaches={activeCoaches} />
                </div>
            )}

            {/* Search */}
            <form method="GET" className="flex gap-2">
                <input
                    name="q"
                    defaultValue={q ?? ''}
                    placeholder="Buscar por nombre o email..."
                    className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                    type="submit"
                    className="px-4 py-2 text-sm rounded-lg bg-secondary hover:bg-accent transition-colors"
                >
                    Buscar
                </button>
            </form>

            {/* Client list */}
            {clients.length > 0 ? (
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                    {clients.map(client => (
                        <div key={client.id} className="flex items-center gap-3 px-4 py-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${client.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                {client.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{client.full_name ?? '—'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{client.email ?? ''}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {client.is_active ? (
                                    <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                    <UserX className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                {isAdmin && (
                                    <AssignClientSelect
                                        orgSlug={slug}
                                        clientId={client.id}
                                        currentCoachId={client.coach_id ?? undefined}
                                        coaches={activeCoaches}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                    {q ? 'Sin resultados para esa búsqueda.' : 'Sin clientes en el pool todavía.'}
                </p>
            )}
        </div>
    )
}
