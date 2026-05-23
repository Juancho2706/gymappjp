import type { Metadata } from 'next'
import { Building2, Users, UserCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { getOrgs, type OrgRow } from './_data/orgs.queries'
import { ResendOwnerInviteButton } from './_components/ResendOwnerInviteButton'

export const metadata: Metadata = { title: 'Organizaciones' }

function StatusIcon({ status }: { status: string }) {
    if (status === 'active') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    if (status === 'trial') return <AlertTriangle className="w-4 h-4 text-amber-500" />
    return <XCircle className="w-4 h-4 text-red-500" />
}

export default async function AdminOrgsPage() {
    const orgs = await getOrgs()

    return (
        <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        Organizaciones enterprise
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{orgs.length} organización{orgs.length !== 1 ? 'es' : ''}</p>
                </div>
            </div>

            {orgs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-12 text-center">
                    <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Sin organizaciones enterprise todavía.</p>
                </div>
            ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Organización</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Estado</th>
                                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                                        <Users className="w-3.5 h-3.5 inline mr-0.5" />Coaches
                                    </th>
                                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                                        <UserCheck className="w-3.5 h-3.5 inline mr-0.5" />Clientes
                                    </th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Plan</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Moneda</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Creada</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {orgs.map(org => (
                                    <tr key={org.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-medium">{org.name}</p>
                                                <p className="text-[11px] text-muted-foreground font-mono">{org.slug}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <StatusIcon status={org.status} />
                                                <span className="capitalize text-xs">{org.status}</span>
                                            </div>
                                            {org.trial_ends_at && (
                                                <p className="text-[10px] text-amber-500 mt-0.5">
                                                    Trial: {new Date(org.trial_ends_at).toLocaleDateString('es-CL')}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="font-semibold">{org.memberCount}</span>
                                            <span className="text-[11px] text-muted-foreground">/{org.seats_included}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center font-semibold">
                                            {org.clientCount}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="capitalize text-xs">{org.plan}</span>
                                            <span className="text-[10px] text-muted-foreground block">{org.billing_cycle ?? 'monthly'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">{org.currency}</td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {org.created_at ? new Date(org.created_at).toLocaleDateString('es-CL') : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1.5">
                                                <a
                                                    href={`/org/${org.slug}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[11px] text-violet-500 hover:underline whitespace-nowrap"
                                                >
                                                    Ver org →
                                                </a>
                                                <ResendOwnerInviteButton orgId={org.id} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
