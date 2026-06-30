import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Users, Crown, Shield, User, ChevronRight, Sparkles, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getCoachTeamOverview } from './_data/team.queries'
import TeamMembersManager from './_components/TeamMembersManager'
import { TeamBrandStudio } from './_components/TeamBrandStudio'
import { TeamShareLink } from './_components/TeamShareLink'
import { CoachTeamDesktop } from './_components/CoachTeamDesktop'

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
        <div className="mx-auto w-full max-w-5xl space-y-4 px-5 pb-6 pt-2 sm:px-6 md:max-w-none md:px-0 md:pb-0 md:pt-0">
            {teams.map((team) => {
                const accent = team.primary_color || '#10B981'
                const seatPct = team.seat_limit > 0
                    ? Math.min(100, Math.round((team.activeMemberCount / team.seat_limit) * 100))
                    : 0
                // Anillo SVG de cupos: r=22 -> circunferencia ≈ 138.2 (diseño eva-app)
                const ringLen = 2 * Math.PI * 22
                const ringOffset = ringLen * (1 - seatPct / 100)
                const activeModules = Object.values(team.enabled_modules).filter(Boolean).length
                const initials = team.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
                // texto legible sobre el color de marca (claro -> tinta, oscuro -> blanco)
                const onAccent = (() => {
                    const h = accent.replace('#', '')
                    if (h.length !== 6) return '#FFFFFF'
                    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
                    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    return lum > 0.6 ? '#0F1729' : '#FFFFFF'
                })()
                const roleLabel = team.isOwner ? 'Owner' : team.isManager ? 'Co-gestor' : 'Miembro'
                const RoleIcon = team.isOwner ? Crown : team.isManager ? Shield : User

                return (
                    <div key={team.id}>
                        {/* ── DESKTOP (md+) — maestro-detalle 1:1 con DesktopTeamEquipo ── */}
                        <div className="hidden md:block">
                            <CoachTeamDesktop team={team} userId={userId} />
                        </div>

                        {/* ── MÓVIL (<md) — pantalla en columna verbatim, sin cambios ── */}
                        <section className="space-y-4 md:hidden">
                        {/* ── Hero de identidad ─────────────────────────── */}
                        <header className="rounded-card border border-[var(--border-inverse)] bg-[var(--surface-inverse)] p-5 text-on-dark">
                            <div className="flex items-center gap-3.5">
                                <span
                                    className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control font-display text-[22px] font-black"
                                    style={{
                                        backgroundColor: team.logo_url ? 'var(--surface-card)' : accent,
                                        color: onAccent,
                                    }}
                                >
                                    {team.logo_url ? (
                                        <Image src={team.logo_url} alt={team.name} fill className="object-contain p-1.5" />
                                    ) : initials ? (
                                        initials
                                    ) : (
                                        <Users className="h-6 w-6" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-display text-[22px] font-black text-on-dark">{team.name}</div>
                                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-[3px]">
                                        <RoleIcon className="h-[13px] w-[13px] text-sport-300" />
                                        <span className="text-[11.5px] font-bold text-on-dark">{roleLabel}</span>
                                    </div>
                                </div>
                            </div>

                            <p className="my-3 text-[12.5px] text-on-dark-muted">Pool compartido — todo el equipo ve a todos los alumnos.</p>

                            {/* Accesos de alumnos */}
                            <div className="mb-4">
                                <TeamShareLink teamSlug={team.slug} inviteCode={team.invite_code} />
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-2.5 border-t border-[var(--border-inverse)] pt-3.5">
                                <div className="flex-1 text-center">
                                    <div className="relative mx-auto h-[52px] w-[52px]">
                                        <svg width="52" height="52" className="-rotate-90">
                                            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
                                            <circle
                                                cx="26" cy="26" r="22" fill="none" strokeWidth="5" strokeLinecap="round"
                                                stroke={accent} strokeDasharray={ringLen} strokeDashoffset={ringOffset}
                                            />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-on-dark">
                                            {team.activeMemberCount}/{team.seat_limit}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-on-dark-muted">Cupos</div>
                                </div>

                                <div className="flex-1 text-center">
                                    <div className="font-display text-[26px] font-black leading-none text-on-dark">{team.poolClientCount}</div>
                                    <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-on-dark-muted">Alumnos</div>
                                </div>

                                <Link href="/coach/settings/modules" className="flex-1 text-center">
                                    <div className="font-display text-[26px] font-black leading-none text-on-dark">{activeModules}</div>
                                    <div className="mt-1 inline-flex items-center gap-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-sport-300">
                                        Módulos <ChevronRight className="h-[11px] w-[11px]" />
                                    </div>
                                </Link>
                            </div>
                        </header>

                        {/* ── Brand Studio ──────────────────────────────── */}
                        <div className="mx-1 flex items-center justify-between">
                            <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
                                {team.isManager ? 'Brand Studio' : 'Marca del equipo'}
                            </h2>
                            {!team.isManager && (
                                <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-1 text-[11px] font-semibold text-muted">
                                    <Lock className="h-3 w-3" /> Solo lectura
                                </span>
                            )}
                        </div>

                        <div className="rounded-card border border-subtle bg-surface-card p-4 sm:p-5">
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
                        <div className="rounded-card border border-subtle bg-surface-card p-4 sm:p-5">
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

                        {/* ── Footer EVA Teams ──────────────────────────── */}
                        <div className="flex flex-col items-center gap-2 pt-4 opacity-60">
                            <div className="flex items-center gap-1.5 text-muted">
                                <Sparkles className="h-4 w-4" />
                                <span className="font-display text-sm font-extrabold tracking-tight">EVA</span>
                            </div>
                            <span className="text-xs font-semibold text-subtle">EVA Teams · {team.name}</span>
                        </div>
                        </section>
                    </div>
                )
            })}
        </div>
    )
}
