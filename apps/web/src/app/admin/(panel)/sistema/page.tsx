import { getSistemaData } from './_data/sistema.queries'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Database, Users, UserCheck, AlertTriangle,
    CheckCircle, XCircle, Clock, Shield, Timer
} from 'lucide-react'
import { PageInfoButton } from '../_components/PageInfoButton'

export const metadata = { title: 'Sistema' }

const SISTEMA_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'Health check en tiempo real del estado operativo de la plataforma. No tiene cache — cada visita consulta la base de datos directamente para mostrar el estado actual.',
    },
    {
        heading: 'Conectividad — Base de datos',
        body: 'Verifica que la conexión al proyecto Supabase responda correctamente. Si falla, ninguna parte de la app funciona. Fuente: query directa a la tabla coaches.',
    },
    {
        heading: 'Conectividad — Coaches legacy sin expirar',
        body: 'Detecta coaches con payment_provider=\'beta\', subscription_status=\'active\' y current_period_end en el pasado. Estos coaches tienen un bug pre-fix: están marcados como activos pero su trial ya venció. Deben actualizarse a status=\'trialing\' o \'expired\'. Fuente: tabla coaches.',
    },
    {
        heading: 'Conectividad — Coaches vencidos sin pago',
        body: 'Coaches con status \'past_due\' o \'pending_payment\'. Tienen cobro fallido de MercadoPago. Fuente: tabla coaches.',
    },
    {
        heading: 'Conectividad — Auditoría activa',
        body: 'Muestra cuándo fue la última acción registrada en admin_audit_logs. Si dice "sin actividad" es normal si no se hizo nada recientemente. Fuente: tabla admin_audit_logs.',
    },
    {
        heading: 'Tarjetas de plataforma',
        body: 'Total coaches — todos los registros en la tabla coaches.\nTotal alumnos — todos los registros en la tabla clients.\nActivos — coaches con status active o trialing (con acceso habilitado).\nBeta — coaches con payment_provider=\'beta\' (prueba sin pago).\nExpirados — coaches con status=\'expired\' (bloqueados hasta pagar).\nMorosos — coaches con status past_due o pending_payment.\nFuente: queries directas a Supabase, sin cache.',
    },
    {
        heading: 'Acciones de auditoría (24h)',
        body: 'Cantidad de operaciones administrativas registradas en las últimas 24 horas. Útil para saber si el panel se está usando activamente.',
    },
]

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-subtle last:border-0">
            <div className="flex items-center gap-2">
                {ok
                    ? <CheckCircle className="h-3.5 w-3.5 text-[var(--success-500)]" />
                    : <XCircle className="h-3.5 w-3.5 text-[var(--danger-500)]" />
                }
                <span className="text-sm text-strong">{label}</span>
            </div>
            {detail && <span className="font-mono text-xs text-muted">{detail}</span>}
        </div>
    )
}

function StatCard({ label, value, icon: Icon, warn }: { label: string; value: number; icon: React.ElementType; warn?: boolean }) {
    return (
        <div className={`rounded-lg border bg-surface-card px-4 py-3 ${warn && value > 0 ? 'border-[var(--warning-500)]/40' : 'border-subtle'}`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium uppercase tracking-widest text-muted">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${warn && value > 0 ? 'text-[var(--warning-500)]' : 'text-muted'}`} />
            </div>
            <span className={`font-mono text-2xl font-bold tabular-nums ${warn && value > 0 ? 'text-[var(--warning-500)]' : 'text-strong'}`}>
                {value}
            </span>
        </div>
    )
}

export default async function AdminSistemaPage() {
    const d = await getSistemaData()
    const checkedAtMs = new Date(d.checkedAt).getTime()

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Sistema</h1>
                    <p className="text-xs text-muted">Health check y estado operativo de la plataforma.</p>
                </div>
                <PageInfoButton title="Sistema — Guía completa" sections={SISTEMA_INFO} />
            </div>

            {/* Health checks */}
            <div className="rounded-xl border border-subtle bg-surface-card">
                <div className="border-b border-subtle px-4 py-3">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted">
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
                        label="Auditoría activa (última acción < 48h)"
                        // `recentAuditCount >= 0` era una tautologia (un count nunca es negativo):
                        // el check no podia fallar jamas (ROTO-7b, F0 08-05). La frescura se
                        // computa en el loader contra `checkedAt` (Date.now en render = lint error).
                        ok={d.auditActive}
                        detail={d.lastAuditAt
                            ? `Última: ${formatDistanceToNow(new Date(d.lastAuditAt), { addSuffix: true, locale: es })}`
                            : 'Sin actividad'
                        }
                    />
                </div>
            </div>

            {/* Platform stats grid */}
            <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted">Plataforma</h3>
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
            <div className="rounded-xl border border-subtle bg-surface-card px-4 py-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-body">Acciones de auditoría (últimas 24h)</span>
                    <span className="font-mono text-lg font-bold tabular-nums text-strong">{d.recentAuditCount}</span>
                </div>
            </div>

            {/* Cron monitoring */}
            <div className="rounded-xl border border-subtle bg-surface-card">
                <div className="border-b border-subtle px-4 py-3">
                    <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted">
                        <Timer className="h-3.5 w-3.5" />
                        Estado de crons
                    </h3>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                    {d.cronStatuses.map(cron => {
                        const lastRun = cron.lastRunAt ? new Date(cron.lastRunAt) : null
                        const hoursAgo = lastRun ? (checkedAtMs - lastRun.getTime()) / 3_600_000 : null
                        const isStale = hoursAgo !== null && hoursAgo > 26
                        const neverRan = lastRun === null

                        return (
                            <div key={cron.action} className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    {neverRan
                                        ? <Clock className="h-3.5 w-3.5 text-muted" />
                                        : isStale
                                            ? <XCircle className="h-3.5 w-3.5 text-[var(--warning-500)]" />
                                            : <CheckCircle className="h-3.5 w-3.5 text-[var(--success-500)]" />
                                    }
                                    <span className="text-sm text-strong">{cron.label}</span>
                                    <span className="font-mono text-[10px] text-muted">{cron.action}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {cron.lastResult && (
                                        <span className="font-mono text-[10px] text-muted max-w-[200px] truncate">{cron.lastResult}</span>
                                    )}
                                    <span className={`text-xs font-medium ${neverRan ? 'text-muted' : isStale ? 'text-[var(--warning-500)]' : 'text-[var(--success-500)]'}`}>
                                        {neverRan
                                            ? 'Nunca ejecutado'
                                            : isStale
                                                ? `Hace ${Math.floor(hoursAgo!)}h — ¡atrasado!`
                                                : formatDistanceToNow(lastRun!, { addSuffix: true, locale: es })
                                        }
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                    {d.cronStatuses.length === 0 && (
                        <p className="px-4 py-6 text-center text-xs text-muted">Sin datos de crons</p>
                    )}
                </div>
            </div>
        </div>
    )
}
