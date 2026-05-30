import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    Eye,
    Megaphone,
    MessageSquareText,
    Radio,
    Send,
    Sparkles,
    Users,
} from 'lucide-react'
import { getOrgAnnouncements, getOrgBySlug, getOrgClients, getOrgMembers } from '../_data/org.queries'
import { CreateAnnouncementForm } from './_components/CreateAnnouncementForm'
import { AnnouncementRow } from './_components/AnnouncementRow'

export const metadata: Metadata = { title: 'Novedades' }

interface Props {
    params: Promise<{ slug: string }>
}

function isExpired(activeUntil: string | null) {
    return activeUntil ? new Date(activeUntil) < new Date() : false
}

function formatDate(value: string | null) {
    if (!value) return 'Sin vencimiento'
    return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AnnouncementsPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = org.myRole === 'org_owner' || org.myRole === 'org_admin'
    if (!isAdmin) redirect(`/org/${slug}`)

    const [announcements, clients, members] = await Promise.all([
        getOrgAnnouncements(org.id),
        getOrgClients(org.id),
        getOrgMembers(org.id),
    ])

    const activeClients = clients.filter(client => client.is_active !== false)
    const activeCoaches = members.filter(member => member.role === 'coach' && member.status === 'active' && member.coach_id)
    const liveAnnouncements = announcements.filter(item => item.is_active && !isExpired(item.active_until))
    const expiredAnnouncements = announcements.filter(item => isExpired(item.active_until))
    const inactiveAnnouncements = announcements.filter(item => !item.is_active && !isExpired(item.active_until))
    const latestLive = liveAnnouncements[0] ?? null

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(244,114,182,0.14),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(34,211,238,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_430px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">
                                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                                Herramientas / Novedades
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Centro de comunicacion enterprise
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Publica mensajes visibles para alumnos enterprise. Mantiene caducidad, estado y preview para evitar anuncios viejos o ambiguos.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <Link
                                    href={`/org/${slug}/clients`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-200"
                                >
                                    Revisar alumnos
                                    <Users className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <Link
                                    href={`/org/${slug}/audit`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                                >
                                    Ver auditoria
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Activas', liveAnnouncements.length],
                                ['Borradores', inactiveAnnouncements.length],
                                ['Expiradas', expiredAnnouncements.length],
                                ['Audiencia', activeClients.length],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {([
                        [Send, 'Canal actual', 'Alumnos', 'visible en dashboard alumno enterprise'],
                        [Users, 'Audiencia', activeClients.length, `${activeCoaches.length} coaches enterprise vinculados`],
                        [CalendarClock, 'Proximo vencimiento', latestLive ? formatDate(latestLive.active_until) : 'Sin activo', latestLive?.title ?? 'no hay mensaje activo'],
                        [AlertTriangle, 'Riesgo contenido', expiredAnnouncements.length, 'expirados que no deben seguir visibles'],
                    ] as const).map(([Icon, title, value, detail]) => (
                        <div key={title as string} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Icon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                                <p className="truncate text-right text-lg font-black text-white">{value as string | number}</p>
                            </div>
                            <h2 className="mt-4 text-sm font-black text-white">{title as string}</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail as string}</p>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-[440px_1fr]">
                    <div className="space-y-5">
                        <CreateAnnouncementForm orgSlug={slug} audienceCount={activeClients.length} />

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Preview alumno</h2>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Asi se entiende el mensaje en el dashboard del alumno. La entrega real sigue limitada al flujo enterprise.
                            </p>
                            <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                                <p className="text-sm font-black text-cyan-100">{latestLive?.title ?? 'Titulo de novedad'}</p>
                                <p className="mt-1 text-sm leading-6 text-cyan-50/80">
                                    {latestLive?.body ?? 'Mensaje claro, corto y accionable para alumnos enterprise.'}
                                </p>
                            </div>
                        </section>
                    </div>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Radio className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                                    <h2 className="text-lg font-black text-white">Timeline de anuncios</h2>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">
                                    Ordenado por creacion. Activar/desactivar y eliminar ya quedan auditados.
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Sin proveedores externos
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {announcements.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center">
                                    <MessageSquareText className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                                    <p className="mt-3 text-sm font-bold text-zinc-300">Sin novedades publicadas</p>
                                    <p className="mt-1 text-sm text-zinc-500">Crea el primer mensaje cuando haya informacion accionable para alumnos.</p>
                                </div>
                            ) : (
                                announcements.map(announcement => (
                                    <AnnouncementRow key={announcement.id} orgSlug={slug} announcement={{ ...announcement, created_at: announcement.created_at ?? '' }} />
                                ))
                            )}
                        </div>
                    </section>
                </section>
            </div>
        </div>
    )
}
