import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Users, UserCheck, Package, Crown, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getCoachTeamOverview } from './_data/team.queries'
import TeamMembersManager from './_components/TeamMembersManager'
import { TeamBrandStudio } from './_components/TeamBrandStudio'
import { TeamShareLink } from './_components/TeamShareLink'

export const metadata = { title: 'Mi Equipo' }

export default async function CoachTeamPage() {
    // Módulo EXCLUSIVO del contexto team: fuera de él, el módulo no existe (separación de flujos).
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) redirect('/login')
    const workspace = await getPreferredWorkspaceForRender(user.id)
    if (workspace?.type !== 'coach_team') redirect('/coach/dashboard')

    const { userId, teams } = await getCoachTeamOverview(workspace.teamId)
    if (!userId) redirect('/login')

    if (teams.length === 0) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
                <h1 className="font-display text-2xl font-bold tracking-tight text-strong">Mi equipo</h1>
                <div className="mt-6 flex flex-col items-center gap-2 rounded-card border border-subtle bg-surface-card py-12 text-center">
                    <Users className="h-8 w-8 text-muted" />
                    <p className="text-sm font-semibold text-strong">No perteneces a ningún equipo</p>
                    <p className="text-xs text-muted">Cuando te sumen a un pool de coaches, aparecerá acá.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            {teams.map((team) => {
                const accent = team.primary_color || '#10B981'
                const seatPct = team.seat_limit > 0
                    ? Math.min(100, Math.round((team.activeMemberCount / team.seat_limit) * 100))
                    : 0
                // Anillo SVG de cupos: r=26 -> circunferencia ≈ 163.4
                const ringLen = 163.4
                const ringOffset = ringLen * (1 - seatPct / 100)
                const activeModules = Object.values(team.enabled_modules).filter(Boolean).length

                return (
                    <section key={team.id} className="space-y-5">
                        {/* ── Hero de identidad ─────────────────────────── */}
                        <header
                            className="relative overflow-hidden rounded-card border border-[var(--border-inverse)] bg-[var(--surface-inverse)] p-5 text-on-dark sm:p-6"
                        >
                            <div
                                className="pointer-events-none absolute inset-0"
                                aria-hidden
                                style={{ background: `radial-gradient(ellipse 80% 120% at 0% 0%, ${accent}33, transparent 60%)` }}
                            />
                            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-4">
                                    <div
                                        className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control border shadow-sm"
                                        style={{ borderColor: `${accent}55`, backgroundColor: `${accent}26` }}
                                    >
                                        {team.logo_url ? (
                                            <Image src={team.logo_url} alt={team.name} fill className="object-contain p-1.5" />
                                        ) : (
                                            <Users className="h-6 w-6" style={{ color: accent }} />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-on-dark">{team.name}</h1>
                                            {team.isOwner ? (
                                                <span className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: accent }}>
                                                    <Crown className="h-3 w-3" /> Owner
                                                </span>
                                            ) : team.isManager ? (
                                                <span className="inline-flex items-center rounded-pill bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-on-dark">Co-gestor</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-pill bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-on-dark">Miembro</span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-sm text-on-dark-muted">Pool compartido — todo el equipo ve a todos los alumnos</p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <TeamShareLink teamSlug={team.slug} inviteCode={team.invite_code} />
                                </div>
                            </div>

                            {/* Stats row */}
                            <div className="relative mt-5 grid grid-cols-3 gap-3">
                                <div className="flex items-center gap-3 rounded-control border border-[var(--border-inverse)] bg-white/5 p-3">
                                    <svg viewBox="0 0 60 60" className="h-12 w-12 shrink-0 -rotate-90">
                                        <circle cx="30" cy="30" r="26" fill="none" strokeWidth="6" stroke="rgba(255,255,255,0.14)" />
                                        <circle
                                            cx="30" cy="30" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                                            stroke={accent} strokeDasharray={ringLen} strokeDashoffset={ringOffset}
                                        />
                                    </svg>
                                    <div className="min-w-0">
                                        <p className="font-display text-xl font-bold leading-none tracking-tight text-on-dark">
                                            {team.activeMemberCount}<span className="text-sm font-semibold text-on-dark-muted">/{team.seat_limit}</span>
                                        </p>
                                        <p className="mt-1 text-[11px] uppercase tracking-wide text-on-dark-muted">Cupos</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 rounded-control border border-[var(--border-inverse)] bg-white/5 p-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control" style={{ backgroundColor: `${accent}26` }}>
                                        <UserCheck className="h-5 w-5" style={{ color: accent }} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-display text-xl font-bold leading-none tracking-tight text-on-dark">{team.poolClientCount}</p>
                                        <p className="mt-1 text-[11px] uppercase tracking-wide text-on-dark-muted">Alumnos</p>
                                    </div>
                                </div>

                                <Link
                                    href="/coach/settings/modules"
                                    className="group flex items-center gap-3 rounded-control border border-[var(--border-inverse)] bg-white/5 p-3 transition-colors hover:border-white/25"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control" style={{ backgroundColor: `${accent}26` }}>
                                        <Package className="h-5 w-5" style={{ color: accent }} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-display text-xl font-bold leading-none tracking-tight text-on-dark">{activeModules}</p>
                                        <p className="mt-1 text-[11px] uppercase tracking-wide text-on-dark-muted group-hover:text-on-dark">Módulos →</p>
                                    </div>
                                </Link>
                            </div>
                        </header>

                        {/* ── Brand Studio ──────────────────────────────── */}
                        <div className="rounded-card border border-subtle bg-surface-card p-4 sm:p-6">
                            <div className="mb-4 flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-control" style={{ backgroundColor: `${accent}26` }}>
                                    <Sparkles className="h-4 w-4" style={{ color: accent }} />
                                </span>
                                <div>
                                    <h2 className="font-display text-base font-bold leading-tight tracking-tight text-strong">Marca del equipo</h2>
                                    <p className="text-xs text-muted">La identidad que ven tus alumnos y todo el pool</p>
                                </div>
                            </div>
                            <TeamBrandStudio
                                teamId={team.id}
                                teamSlug={team.slug}
                                brand={{
                                    name: team.name,
                                    primary_color: team.primary_color,
                                    logo_url: team.logo_url,
                                    logo_url_dark: team.logo_url_dark,
                                    accent_light: team.accent_light,
                                    accent_dark: team.accent_dark,
                                    neutral_tint: team.neutral_tint,
                                    splash_bg_color: team.splash_bg_color,
                                    loader_text: team.loader_text,
                                    loader_text_color: team.loader_text_color,
                                    loader_icon_mode: team.loader_icon_mode,
                                    use_custom_loader: team.use_custom_loader,
                                }}
                                canEdit={team.isManager}
                            />
                        </div>

                        {/* ── Miembros ──────────────────────────────────── */}
                        <div className="rounded-card border border-subtle bg-surface-card p-4 sm:p-6">
                            <TeamMembersManager
                                teamId={team.id}
                                ownerCoachId={team.owner_coach_id}
                                userId={userId}
                                isManager={team.isManager}
                                isOwner={team.isOwner}
                                seatLimit={team.seat_limit}
                                activeMemberCount={team.activeMemberCount}
                                members={team.members}
                            />
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
