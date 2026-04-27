import { getSistemaData } from './_data/sistema.queries'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Database, Users, UserCheck, AlertTriangle,
    CheckCircle, XCircle, Clock, Shield
} from 'lucide-react'

export const metadata = { title: 'Sistema' }

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-[--admin-border] last:border-0">
            <div className="flex items-center gap-2">
                {ok
                    ? <CheckCircle className="h-3.5 w-3.5 text-[--admin-green]" />
                    : <XCircle className="h-3.5 w-3.5 text-[--admin-red]" />
                }
                <span className="text-sm text-[--admin-text-1]">{label}</span>
            </div>
            {detail && <span className="font-mono text-xs text-[--admin-text-3]">{detail}</span>}
        </div>
    )
}

function StatCard({ label, value, icon: Icon, warn }: { label: string; value: number; icon: React.ElementType; warn?: boolean }) {
    return (
        <div className={`rounded-lg border bg-[--admin-bg-surface] px-4 py-3 ${warn && value > 0 ? 'border-[--admin-amber]/40' : 'border-[--admin-border]'}`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3]">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${warn && value > 0 ? 'text-[--admin-amber]' : 'text-[--admin-text-3]'}`} />
            </div>
            <span className={`font-mono text-2xl font-bold tabular-nums ${warn && value > 0 ? 'text-[--admin-amber]' : 'text-[--admin-text-1]'}`}>
                {value}
            </span>
        </div>
    )
}

export default async function AdminSistemaPage() {
    const d = await getSistemaData()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Sistema</h1>
                <p className="text-xs text-[--admin-text-3]">Health check y estado operativo de la plataforma.</p>
            </div>

            {/* Health checks */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface]">
                <div className="border-b border-[--admin-border] px-4 py-3">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">
                        <Database className="h-3.5 w-3.5" />
                        Conectividad
                    </h3>
                </div>
                <div className="px-4">
                    <StatusRow
                        label="Base de datos Supabase"
                        ok={d.dbConnected}
                        detail={d.dbConnected ? 'OK' : 'Sin conexión'}
                    />
                    <StatusRow
                        label="Coaches sin expirar legacy (beta active con period_end pasado)"
                        ok={d.orphanCoaches === 0}
                        detail={d.orphanCoaches > 0 ? `${d.orphanCoaches} afectados` : 'Ninguno'}
                    />
                    <StatusRow
                        label="Coaches vencidos sin pago (past_due / pending_payment)"
                        ok={d.overdueCoaches === 0}
                        detail={d.overdueCoaches > 0 ? `${d.overdueCoaches} coaches` : 'Ninguno'}
                    />
                    <StatusRow
                        label="Auditoría activa (últimas 24h)"
                        ok={d.recentAuditCount >= 0}
                        detail={d.lastAuditAt
                            ? `Última: ${formatDistanceToNow(new Date(d.lastAuditAt), { addSuffix: true, locale: es })}`
                            : 'Sin actividad'
                        }
                    />
                </div>
            </div>

            {/* Platform stats grid */}
            <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-[--admin-text-3]">Plataforma</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <StatCard label="Total coaches" value={d.totalCoaches} icon={Users} />
                    <StatCard label="Total alumnos" value={d.totalClients} icon={UserCheck} />
                    <StatCard label="Activos" value={d.activeCoaches} icon={CheckCircle} />
                    <StatCard label="Beta" value={d.betaCoaches} icon={Shield} />
                    <StatCard label="Expirados" value={d.expiredCoaches} icon={Clock} warn />
                    <StatCard label="Morosos" value={d.overdueCoaches} icon={AlertTriangle} warn />
                </div>
            </div>

            {/* Audit summary */}
            <div className="rounded-lg border border-[--admin-border] bg-[--admin-bg-surface] px-4 py-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-[--admin-text-2]">Acciones de auditoría (últimas 24h)</span>
                    <span className="font-mono text-lg font-bold tabular-nums text-[--admin-text-1]">{d.recentAuditCount}</span>
                </div>
            </div>
        </div>
    )
}
