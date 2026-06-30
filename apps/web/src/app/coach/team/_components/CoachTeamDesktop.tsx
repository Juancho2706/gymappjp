'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
    Users, ShieldCheck, Layers, UserPlus, Shield, Crown, UserMinus, Pencil,
    Copy, Check, CheckCircle2, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    removeTeamMemberAction, setTeamMemberManageAction, transferTeamOwnershipAction,
    updateTeamMemberRoleAction,
} from '../_actions/team.actions'
import { AddCoachDialog, EditRoleDialog } from './TeamMembersManager'
import type { TeamOverview, TeamMemberView } from '../_data/team.queries'

/**
 * EQUIPO (Teams) coach DESKTOP (md+) — transcripción 1:1 de `DesktopTeamEquipo`
 * (docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx) sobre data real + server
 * actions reales. Maestro-detalle: header de KPIs del pool, rail de miembros (avatar, rol,
 * especialidad) + "Invitar", panel de detalle con matriz de permisos y acciones gated por rol.
 * Móvil (<md) lo cubre el layout en columna de page.tsx — este componente monta con `hidden md:block`.
 */

type Role = 'Owner' | 'Co-gestor' | 'Miembro'

// Tono de rol — espejo VERBATIM del DS Badge (Owner=sport, Co-gestor=aqua, Miembro=neutral).
const ROLE_TONE: Record<Role, { soft: string; softFg: string; solid: string; solidFg: string }> = {
    Owner: { soft: 'var(--sport-100)', softFg: 'var(--sport-600)', solid: 'var(--sport-500)', solidFg: 'var(--text-on-sport, #fff)' },
    'Co-gestor': { soft: 'var(--aqua-100)', softFg: 'var(--aqua-600)', solid: 'var(--aqua-500)', solidFg: '#fff' },
    Miembro: { soft: 'var(--surface-sunken)', softFg: 'var(--text-subtle)', solid: 'var(--surface-sunken)', solidFg: 'var(--text-body)' },
}

// Acento de KPI — espejo de .dt-kpi[data-tone] (sport / success / ember).
const KPI_TONE: Record<'sport' | 'success' | 'ember', { bg: string; fg: string }> = {
    sport: { bg: 'var(--sport-100)', fg: 'var(--sport-600)' },
    success: { bg: 'var(--success-100)', fg: 'var(--success-700)' },
    ember: { bg: 'var(--ember-100)', fg: 'var(--ember-600)' },
}

function initialsOf(name: string): string {
    return name.split(' ').map((s) => s[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

type EnrichedMember = TeamMemberView & {
    role: Role
    you: boolean
    isMemberOwner: boolean
    manage: boolean
    students: number
    specialty: string
}

type Toast = { type: 'success' | 'error'; msg: string } | null

export function CoachTeamDesktop({ team, userId }: { team: TeamOverview; userId: string }) {
    const [pending, startTransition] = useTransition()
    const [selId, setSelId] = useState<string | null>(team.members[0]?.id ?? null)
    const [toast, setToast] = useState<Toast>(null)
    const toastTimer = useRef<number | null>(null)
    const [copied, setCopied] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<EnrichedMember | null>(null)
    const [removeTarget, setRemoveTarget] = useState<EnrichedMember | null>(null)
    const [transferTarget, setTransferTarget] = useState<EnrichedMember | null>(null)

    const meIsOwner = team.isOwner
    const meIsManager = team.isManager
    const seatsFull = team.activeMemberCount >= team.seat_limit

    // Miembros enriquecidos con rol/especialidad/alumnos derivados de la data real.
    const members: EnrichedMember[] = useMemo(
        () =>
            team.members.map((m) => {
                const isMemberOwner = m.coach_id === team.owner_coach_id
                const role: Role = isMemberOwner ? 'Owner' : m.can_manage ? 'Co-gestor' : 'Miembro'
                return {
                    ...m,
                    role,
                    you: m.coach_id === userId,
                    isMemberOwner,
                    manage: role !== 'Miembro',
                    students: team.studentsByCoach[m.coach_id] ?? 0,
                    specialty: m.display_role || 'Coach',
                }
            }),
        [team.members, team.owner_coach_id, team.studentsByCoach, userId]
    )

    // Si el seleccionado desaparece (removido), cae al primero.
    useEffect(() => {
        if (selId && !members.some((m) => m.id === selId)) setSelId(members[0]?.id ?? null)
    }, [members, selId])

    const sel = members.find((m) => m.id === selId) ?? members[0] ?? null

    const seatPct = team.seat_limit > 0
        ? Math.min(100, Math.round((team.activeMemberCount / team.seat_limit) * 100))
        : 0
    const activeModules = Object.values(team.enabled_modules).filter(Boolean).length

    // KPIs del pool — data REAL (no mock): alumnos del pool, coaches activos, módulos activos.
    const kpis = [
        { icon: Users, label: 'Alumnos del pool', value: team.poolClientCount, unit: '', tone: 'sport' as const },
        { icon: ShieldCheck, label: 'Coaches activos', value: team.activeMemberCount, unit: `/${team.seat_limit}`, tone: 'success' as const },
        { icon: Layers, label: 'Módulos activos', value: activeModules, unit: '', tone: 'ember' as const },
    ]

    // Matriz de permisos — refleja el RLS REAL del backend (ver divergencia de marca abajo).
    const PERMS: Array<[string, (m: EnrichedMember) => boolean]> = [
        ['Gestionar sus alumnos', () => true],
        ['Ver alumnos del pool', () => true],
        // Marca del equipo: en EVA la editan owner Y co-gestor (RLS team_teams_manager_update),
        // a diferencia del kit (owner-only). Reflejamos el permiso REAL.
        ['Editar marca del equipo', (m) => m.manage],
        ['Gestionar coaches y cupos', (m) => m.manage],
        ['Facturación del equipo', (m) => m.role === 'Owner'],
    ]

    const flash = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg })
        if (toastTimer.current) window.clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(null), 2400)
    }

    const run = (
        fn: () => Promise<{ error?: string; success?: boolean } | undefined | void>,
        okMsg: string,
        onOk?: () => void
    ) =>
        startTransition(async () => {
            const res = await fn()
            if (res && 'error' in res && res.error) { flash('error', res.error); return }
            flash('success', okMsg)
            onOk?.()
        })

    const copyCode = () => {
        if (!team.invite_code) return
        navigator.clipboard?.writeText(team.invite_code).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
        })
    }

    return (
        <div className="relative flex h-[calc(100dvh-8rem)] min-h-[640px] flex-col overflow-hidden rounded-card border border-subtle bg-surface-app">
            {/* ── KPIs del pool (dt-team-kpis) ──────────────────────────────── */}
            <div className="grid shrink-0 grid-cols-1 gap-3.5 border-b border-subtle px-6 py-5 min-[1001px]:grid-cols-3">
                {kpis.map((k) => {
                    const tone = KPI_TONE[k.tone]
                    const Icon = k.icon
                    return (
                        <div
                            key={k.label}
                            className="rounded-[var(--radius-lg)] border border-subtle bg-surface-card px-[18px] py-4 shadow-sm"
                        >
                            <div className="mb-2.5 flex items-center gap-2">
                                <span
                                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                                    style={{ background: tone.bg, color: tone.fg }}
                                >
                                    <Icon className="h-[17px] w-[17px]" />
                                </span>
                                <span className="whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.05em] text-subtle">
                                    {k.label}
                                </span>
                            </div>
                            <div className="eva-metric text-[34px] leading-none text-strong">
                                {k.value}
                                {k.unit && <span className="text-[16px] text-subtle">{k.unit}</span>}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* ── Cuerpo maestro-detalle (dt-team-body) ─────────────────────── */}
            <div className="flex min-h-0 flex-1">
                {/* Rail de miembros (dt-md-list) */}
                <aside className="flex w-[240px] shrink-0 flex-col border-r border-subtle bg-surface-card min-[861px]:w-[272px] min-[1001px]:w-[320px]">
                    <div className="shrink-0 border-b border-subtle px-4 pb-3 pt-4">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="font-display text-[16px] font-extrabold tracking-[-0.02em] text-strong min-[861px]:text-[18px]">
                                {team.name}
                            </span>
                            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] font-bold text-subtle">
                                {team.activeMemberCount}/{team.seat_limit || team.activeMemberCount}
                            </span>
                            {meIsManager && (
                                <div className="ml-auto flex gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => { setToast(null); setAddOpen(true) }}
                                        disabled={pending || seatsFull}
                                        title={seatsFull ? 'Límite de cupos alcanzado' : 'Invitar coach'}
                                        aria-label="Invitar"
                                        className="eva-press flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-transparent bg-[var(--cta-fill)] text-[var(--text-on-sport)] transition-[filter] hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <UserPlus className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        {/* Cupos (dt-team-seat) */}
                        <div className="flex flex-col gap-[5px]">
                            <span className="h-[6px] overflow-hidden rounded-full bg-surface-sunken">
                                <span className="block h-full rounded-full bg-sport-500" style={{ width: `${seatPct}%` }} />
                            </span>
                            <span className="text-[11.5px] font-semibold text-subtle">
                                {team.activeMemberCount} de {team.seat_limit || '—'} cupos
                            </span>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {members.map((m) => {
                            const active = m.id === sel?.id
                            const tone = ROLE_TONE[m.role]
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setSelId(m.id)}
                                    className={`relative mb-0.5 flex w-full items-center gap-[11px] rounded-control p-2.5 text-left transition-colors ${
                                        active
                                            ? "bg-sport-100 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-sport-500 before:content-['']"
                                            : 'hover:bg-surface-sunken'
                                    }`}
                                >
                                    <span
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[12.5px] font-extrabold tracking-[-0.02em]"
                                        style={{ background: 'var(--surface-inverse)', color: 'var(--sport-400)' }}
                                    >
                                        {initialsOf(m.name)}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                                        <span className="truncate text-[14px] font-bold text-strong">
                                            {m.name}
                                            {m.you && <span className="font-bold text-sport-600"> · vos</span>}
                                        </span>
                                        <span className="hidden truncate text-[11.5px] text-subtle min-[861px]:block">
                                            {m.specialty}
                                        </span>
                                    </span>
                                    <span
                                        className="inline-flex h-5 shrink-0 items-center rounded-pill px-2 text-[11px] font-bold"
                                        style={{ background: tone.soft, color: tone.softFg }}
                                    >
                                        {m.role}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </aside>

                {/* Detalle del miembro (dt-md-detail) */}
                <section key={sel?.id ?? 'empty'} className="relative min-w-0 flex-1 overflow-y-auto">
                    {sel ? (
                        <div className="mx-auto max-w-[var(--dt-read-text)] px-[var(--dt-page-x)] py-6">
                            {/* Perfil (dt-team-prof) */}
                            <div className="mb-2 flex items-center gap-4">
                                <span
                                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-[22px] font-extrabold tracking-[-0.02em]"
                                    style={{ background: 'var(--surface-inverse)', color: 'var(--sport-400)' }}
                                >
                                    {initialsOf(sel.name)}
                                </span>
                                <div className="min-w-0">
                                    <div className="font-display text-[24px] font-black tracking-[-0.02em] text-strong">
                                        {sel.name}
                                        {sel.you && <span className="font-black text-sport-600"> · vos</span>}
                                    </div>
                                    <div className="mb-2.5 mt-0.5 text-[14px] text-muted">{sel.specialty}</div>
                                    <div className="flex gap-2">
                                        <span
                                            className="inline-flex h-6 items-center rounded-pill px-2.5 text-[12px] font-bold"
                                            style={{ background: ROLE_TONE[sel.role].solid, color: ROLE_TONE[sel.role].solidFg }}
                                        >
                                            {sel.role}
                                        </span>
                                        <span
                                            className="inline-flex h-6 items-center rounded-pill px-2.5 text-[12px] font-bold"
                                            style={{ background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }}
                                        >
                                            {sel.students} alumnos
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Permisos (matriz) */}
                            <div className="mb-2.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.06em] text-subtle">
                                Permisos
                            </div>
                            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-subtle bg-surface-card shadow-sm">
                                {PERMS.map(([label, fn], i) => {
                                    const ok = fn(sel)
                                    return (
                                        <div
                                            key={label}
                                            className="flex items-center justify-between gap-3 px-4 py-3 text-[14px] text-body"
                                            style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}
                                        >
                                            <span>{label}</span>
                                            <span
                                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                                style={
                                                    ok
                                                        ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                                        : { background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }
                                                }
                                            >
                                                {ok ? <Check className="h-[15px] w-[15px]" /> : <Minus className="h-[15px] w-[15px]" />}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Acciones gated por rol (solo manager sobre miembros que no son el owner ni vos) */}
                            {meIsManager && !sel.you && !sel.isMemberOwner && (
                                <>
                                    <div className="mb-2.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.06em] text-subtle">
                                        Acciones
                                    </div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {/* Promover/degradar co-gestor: solo owner (setTeamMemberManageAction exige owner). */}
                                        {meIsOwner && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={pending}
                                                onClick={() => run(
                                                    () => setTeamMemberManageAction(team.id, sel.id, !sel.can_manage),
                                                    sel.role === 'Co-gestor' ? 'Co-gestor degradado' : 'Co-gestor asignado'
                                                )}
                                            >
                                                <Shield className="h-4 w-4" />
                                                {sel.role === 'Co-gestor' ? 'Quitar co-gestor' : 'Hacer co-gestor'}
                                            </Button>
                                        )}
                                        {meIsOwner && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={pending}
                                                onClick={() => { setToast(null); setTransferTarget(sel) }}
                                            >
                                                <Crown className="h-4 w-4" /> Transferir propiedad
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => { setToast(null); setEditTarget(sel) }}
                                        >
                                            <Pencil className="h-4 w-4" /> Editar especialidad
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => { setToast(null); setRemoveTarget(sel) }}
                                            style={{ color: 'var(--danger-600)' }}
                                        >
                                            <UserMinus className="h-4 w-4" /> Remover del equipo
                                        </Button>
                                    </div>
                                </>
                            )}

                            {sel.you && (
                                <p className="mt-6 rounded-control bg-surface-sunken p-3.5 text-[13.5px] leading-relaxed text-muted">
                                    Este es tu perfil dentro de <b>{team.name}</b>. Para cambiar tu propio rol, pedíselo al owner del equipo.
                                </p>
                            )}

                            {/* Acceso del equipo (código de invitación) */}
                            {team.invite_code && (
                                <>
                                    <div className="mb-2.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.06em] text-subtle">
                                        Acceso del equipo
                                    </div>
                                    <div className="rounded-[var(--radius-lg)] border border-subtle bg-surface-card p-3.5 shadow-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-subtle">
                                                    Código de invitación
                                                </div>
                                                <div className="eva-mono mt-0.5 text-[15px] font-bold text-strong">{team.invite_code}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={copyCode}
                                                className="eva-press inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-control border border-default bg-surface-card px-3.5 text-[13px] font-bold text-body hover:bg-surface-sunken"
                                            >
                                                {copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}
                                                {copied ? 'Copiado' : 'Copiar'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-10 text-center">
                            <div className="mb-1.5 flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken text-subtle">
                                <Users className="h-[30px] w-[30px]" />
                            </div>
                            <div className="font-display text-[18px] font-extrabold text-strong">Sin miembros</div>
                            <div className="max-w-[320px] text-[13.5px] leading-relaxed text-muted">Invitá coaches a tu equipo.</div>
                        </div>
                    )}
                </section>
            </div>

            {/* Toast (dt-build-toast) */}
            {toast && (
                <div
                    className="absolute bottom-6 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-pill px-[18px] py-[11px] text-[13.5px] font-bold shadow-lg"
                    style={
                        toast.type === 'error'
                            ? { background: 'var(--danger-600)', color: '#fff' }
                            : { background: 'var(--ink-950)', color: '#fff' }
                    }
                >
                    {toast.type === 'success' && <CheckCircle2 className="h-4 w-4" />} {toast.msg}
                </div>
            )}

            {/* Diálogos reales (reutilizados del manager) */}
            {meIsManager && (
                <AddCoachDialog teamId={team.id} isOwner={meIsOwner} open={addOpen} onOpenChange={setAddOpen} />
            )}

            <EditRoleDialog
                member={editTarget}
                pending={pending}
                onOpenChange={(o) => !o && setEditTarget(null)}
                onSave={(role) => run(
                    () => updateTeamMemberRoleAction(team.id, editTarget!.id, role),
                    'Especialidad actualizada',
                    () => setEditTarget(null)
                )}
            />

            <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sacar a {removeTarget?.name} del equipo</AlertDialogTitle>
                        <AlertDialogDescription>
                            Pierde acceso al pool. Los alumnos siguen en el equipo y los ve el resto. Reversible: lo puedes volver a agregar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={pending}
                            onClick={() => run(() => removeTeamMemberAction(team.id, removeTarget!.id), 'Coach removido', () => setRemoveTarget(null))}
                        >
                            Sacar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Transferir propiedad a {transferTarget?.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {transferTarget?.name} pasa a ser owner del equipo (controla cupos, co-gestores y propiedad). Vos quedas como co-gestor. No se puede deshacer salvo que el nuevo owner te la devuelva.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={pending}
                            onClick={() => run(() => transferTeamOwnershipAction(team.id, transferTarget!.coach_id), 'Propiedad transferida', () => setTransferTarget(null))}
                        >
                            Transferir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
