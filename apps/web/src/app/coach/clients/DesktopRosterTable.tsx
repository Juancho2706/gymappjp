'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInDays } from 'date-fns'
import {
    Search,
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Dumbbell,
    MessageCircle,
    Download,
    Archive,
    AlertTriangle,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { bulkArchiveClientsAction } from './_actions/clients.actions'
import type { DirectoryPulseRow } from '@/services/dashboard.service'

/**
 * Vista TABLA de Alumnos (desktop, md+) — transcripción 1:1 de `DesktopRosterTable`
 * (docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx ~L251-348 + CSS `.dt-tbl-*`
 * / `.dt-tr` / `.dt-th` de index.html). Tabla densa ordenable con checkbox de selección,
 * columnas ALUMNO / ESTADO / ADHERENCIA / SEMANA / ÚLTIMA SESIÓN, navegación por teclado
 * (role=grid · ↑/↓/Enter) y barra de acción masiva inferior. Data REAL del directorio
 * (clients + pulse); el click navega a la ficha del alumno (routing real).
 */

type RosterStatus = 'aldia' | 'enriesgo' | 'atrasada'
type SortKey = 'name' | 'status' | 'adherence' | 'week'

// Mapeo de estado = StatusBadge canónico del DS (Shared.jsx): enriesgo→warning (ámbar),
// atrasada→danger (rojo). Verificado contra claude-design-export/screenshots/w3-table.png.
const STATUS_META: Record<RosterStatus, { label: string; pill: string; dot: string; ring: string }> = {
    aldia: {
        label: 'Al día',
        pill: 'bg-[var(--success-100)] text-[var(--success-600)]',
        dot: 'bg-[var(--success-500)]',
        ring: 'var(--success-500)',
    },
    enriesgo: {
        label: 'En riesgo',
        pill: 'bg-[var(--warning-100)] text-[var(--warning-700)]',
        dot: 'bg-[var(--warning-500)]',
        ring: 'var(--warning-500)',
    },
    atrasada: {
        label: 'Atrasada',
        pill: 'bg-[var(--danger-100)] text-[var(--danger-600)]',
        dot: 'bg-[var(--danger-500)]',
        ring: 'var(--danger-500)',
    },
}

const STATUS_ORDER: Record<RosterStatus, number> = { enriesgo: 0, atrasada: 1, aldia: 2 }

// Espejo de CoachRosterMasterDetail/DirRowCard: el estado sale de señales REALES
// (última sesión + attentionScore). atrasada = sin actividad ≥7d · enriesgo = score ≥25.
function rosterStatus(pulse: DirectoryPulseRow | undefined): RosterStatus {
    const last = pulse?.lastWorkoutDate
    const daysSince = last ? differenceInDays(new Date(), new Date(last)) : null
    const score = pulse?.attentionScore ?? 0
    if (daysSince == null || daysSince >= 7) return 'atrasada'
    if (score >= 25) return 'enriesgo'
    return 'aldia'
}

function lastSessionLabel(last: string | null): string {
    if (!last) return '—'
    const d = differenceInDays(new Date(), new Date(last))
    if (d <= 0) return 'Hoy'
    if (d === 1) return 'Ayer'
    return `Hace ${d} días`
}

function initialsOf(name: string): string {
    return (
        name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase() || '?'
    )
}

interface RosterRow {
    id: string
    name: string
    email: string
    goal: string
    status: RosterStatus
    adherence: number
    week: number
    last: string | null
    phone: string | null
}

interface DesktopRosterTableProps {
    clients: any[]
    pulseByClientId: Record<string, DirectoryPulseRow>
    coachSlug?: string
    appUrl: string
}

/** StatusBadge (Badge tone=… dot size=sm) — transcripción del DS Badge. */
function StatusBadge({ status }: { status: RosterStatus }) {
    const meta = STATUS_META[status]
    return (
        <span
            className={cn(
                'inline-flex h-5 items-center gap-1 rounded-pill px-2 text-[11px] font-bold tracking-[0.01em] whitespace-nowrap',
                meta.pill
            )}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
        </span>
    )
}

/** Encabezado de columna ordenable (`.dt-th[data-sortable]`). */
function SortHeader({
    label,
    colKey,
    sortKey,
    dir,
    onSort,
}: {
    label: string
    colKey?: SortKey
    sortKey: SortKey
    dir: 1 | -1
    onSort: (k: SortKey) => void
}) {
    const active = !!colKey && sortKey === colKey
    return (
        <th
            onClick={colKey ? () => onSort(colKey) : undefined}
            className={cn(
                'sticky top-0 z-[1] border-b border-subtle bg-surface-card px-4 py-[11px] text-left text-[11px] font-extrabold uppercase tracking-[0.05em] text-subtle whitespace-nowrap',
                colKey && 'cursor-pointer select-none hover:text-strong'
            )}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {active &&
                    (dir > 0 ? (
                        <ChevronUp className="h-[13px] w-[13px]" />
                    ) : (
                        <ChevronDown className="h-[13px] w-[13px]" />
                    ))}
            </span>
        </th>
    )
}

export function DesktopRosterTable({
    clients,
    pulseByClientId,
    coachSlug,
    appUrl,
}: DesktopRosterTableProps) {
    const router = useRouter()
    const [q, setQ] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('status')
    const [dir, setDir] = useState<1 | -1>(1)
    const [sel, setSel] = useState<Record<string, boolean>>({})
    const [activeId, setActiveId] = useState<string | null>(null)
    const [archiveError, setArchiveError] = useState<string>()
    const [isArchiving, startArchive] = useTransition()

    const loginUrl = coachSlug && appUrl ? `${appUrl}/c/${coachSlug}/login` : ''

    // Filas enriquecidas con data REAL. Excluimos archivados (igual que el rail Ficha).
    const enriched = useMemo<RosterRow[]>(() => {
        return clients
            .filter((c) => c.is_archived !== true)
            .map((c) => {
                const pulse = pulseByClientId[c.id]
                const program = c.workout_programs?.find((p: any) => p.is_active)?.name ?? null
                return {
                    id: c.id,
                    name: c.full_name ?? '',
                    email: c.email ?? '',
                    goal: program ?? 'Sin programa',
                    status: rosterStatus(pulse),
                    adherence: pulse?.percentage ?? 0,
                    week: pulse?.planCurrentWeek ?? 0,
                    last: pulse?.lastWorkoutDate ?? null,
                    phone: c.phone ?? null,
                }
            })
    }, [clients, pulseByClientId])

    const ql = q.trim().toLowerCase()
    const rows = useMemo(() => {
        const cmp: (a: RosterRow, b: RosterRow) => number =
            {
                name: (a: RosterRow, b: RosterRow) => a.name.localeCompare(b.name),
                week: (a: RosterRow, b: RosterRow) => a.week - b.week,
                adherence: (a: RosterRow, b: RosterRow) => a.adherence - b.adherence,
                status: (a: RosterRow, b: RosterRow) =>
                    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.adherence - b.adherence,
            }[sortKey] || (() => 0)
        return enriched
            .filter(
                (s) => s.name.toLowerCase().includes(ql) || s.email.toLowerCase().includes(ql)
            )
            .slice()
            .sort((a, b) => cmp(a, b) * dir)
    }, [enriched, ql, sortKey, dir])

    const selIds = Object.keys(sel).filter((k) => sel[k])
    const allOn = rows.length > 0 && rows.every((r) => sel[r.id])
    const toggleAll = () =>
        setSel(allOn ? {} : Object.fromEntries(rows.map((r) => [r.id, true])))
    const setSort = (k: SortKey) => {
        if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1))
        else {
            setSortKey(k)
            setDir(1)
        }
    }

    const open = (id: string) => {
        setActiveId(id)
        router.push(`/coach/clients/${id}`)
    }

    // ── Acciones masivas (data REAL, sin mock) ───────────────────────────────
    const selectedRows = rows.filter((r) => sel[r.id])

    const handleAsignar = () => {
        // Sin endpoint de asignación masiva: entramos a la ficha del primero (ahí se asigna).
        const first = selIds[0]
        if (first) router.push(`/coach/clients/${first}`)
    }

    const handleMensaje = () => {
        for (const r of selectedRows) {
            if (!r.phone) continue
            const msg = `Hola ${r.name}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${loginUrl}`
            window.open(
                `https://wa.me/${r.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
                '_blank',
                'noopener,noreferrer'
            )
        }
    }

    const handleExport = () => {
        const selected = selectedRows
        const header = ['Nombre', 'Email', 'Estado', 'Adherencia', 'Semana', 'Última sesión']
        const lines = [
            header,
            ...selected.map((r) => [
                r.name,
                r.email,
                STATUS_META[r.status].label,
                `${r.adherence}%`,
                `Sem ${r.week}`,
                lastSessionLabel(r.last),
            ]),
        ]
        const csv = lines
            .map((cols) => cols.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `alumnos-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    const handleArchive = () => {
        setArchiveError(undefined)
        startArchive(async () => {
            const result = await bulkArchiveClientsAction(selIds)
            if (result.error) {
                setArchiveError(result.error)
                return
            }
            setSel({})
            router.refresh()
        })
    }

    // Full-bleed (.dt-tbl-root = position:absolute; inset:0): sin borde/rounding, llena la
    // región entre sidebar y topbar. Alto = viewport menos el topbar de 60px. (Solo desktop —
    // wrapper hidden md:block.)
    return (
        <div className="flex h-[calc(100dvh-60px)] min-h-[600px] flex-col overflow-hidden bg-surface-app">
            {/* ── dt-tbl-bar: búsqueda + conteo ───────────────────────────── */}
            <div className="flex shrink-0 items-center gap-[14px] border-b border-subtle px-6 py-[14px]">
                <div className="relative flex flex-1 items-center" style={{ maxWidth: 340 }}>
                    <span className="pointer-events-none absolute left-2.5 inline-flex text-subtle">
                        <Search className="h-[15px] w-[15px]" />
                    </span>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar alumno…"
                        className="h-9 w-full rounded-control border border-subtle bg-surface-sunken pl-8 pr-2.5 text-[13.5px] text-strong outline-none focus:border-sport-500 focus:bg-surface-card"
                    />
                </div>
                <span className="whitespace-nowrap text-[13px] font-semibold text-muted">
                    {rows.length} alumnos
                </span>
            </div>

            {/* ── dt-tbl-wrap: tabla con nav por teclado ───────────────────── */}
            <div
                className="min-h-0 flex-1 overflow-y-auto outline-none"
                tabIndex={0}
                role="grid"
                aria-label="Alumnos"
                onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
                    const i = rows.findIndex((r) => r.id === activeId)
                    if (e.key === 'Enter') {
                        if (activeId) open(activeId)
                        return
                    }
                    e.preventDefault()
                    const ni =
                        e.key === 'ArrowDown'
                            ? Math.min(rows.length - 1, i + 1)
                            : Math.max(0, i - 1)
                    const next = rows[ni < 0 ? 0 : ni]
                    if (next) setActiveId(next.id)
                }}
            >
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="sticky top-0 z-[1] w-[44px] border-b border-subtle bg-surface-card px-4 py-[11px] text-left">
                                <input
                                    type="checkbox"
                                    checked={allOn}
                                    onChange={toggleAll}
                                    aria-label="Seleccionar todos"
                                    className="h-4 w-4 cursor-pointer accent-sport-500"
                                />
                            </th>
                            <SortHeader label="Alumno" colKey="name" sortKey={sortKey} dir={dir} onSort={setSort} />
                            <SortHeader label="Estado" colKey="status" sortKey={sortKey} dir={dir} onSort={setSort} />
                            <SortHeader label="Adherencia" colKey="adherence" sortKey={sortKey} dir={dir} onSort={setSort} />
                            <SortHeader label="Semana" colKey="week" sortKey={sortKey} dir={dir} onSort={setSort} />
                            <SortHeader label="Última sesión" sortKey={sortKey} dir={dir} onSort={setSort} />
                            <th className="sticky top-0 z-[1] border-b border-subtle bg-surface-card px-4 py-[11px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-4 py-12 text-center text-[13px] text-muted"
                                >
                                    Sin resultados
                                </td>
                            </tr>
                        ) : (
                            rows.map((s) => {
                                const active = s.id === activeId
                                return (
                                    <tr
                                        key={s.id}
                                        aria-selected={active}
                                        onClick={() => open(s.id)}
                                        className={cn(
                                            'cursor-pointer border-b border-subtle transition-colors',
                                            active ? 'bg-sport-100' : 'hover:bg-surface-sunken'
                                        )}
                                    >
                                        {/* checkbox */}
                                        <td
                                            className="w-[44px] px-4 py-[10px] align-middle"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!sel[s.id]}
                                                onChange={() =>
                                                    setSel((p) => ({ ...p, [s.id]: !p[s.id] }))
                                                }
                                                aria-label={`Seleccionar ${s.name}`}
                                                className="h-4 w-4 cursor-pointer accent-sport-500"
                                            />
                                        </td>
                                        {/* Alumno */}
                                        <td className="min-w-[170px] px-4 py-[10px] align-middle">
                                            <div className="flex items-center gap-[11px]">
                                                <span
                                                    className="relative flex h-8 w-8 shrink-0 rounded-full p-0.5"
                                                    style={{ background: STATUS_META[s.status].ring }}
                                                >
                                                    <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-[var(--surface-card)] bg-[var(--surface-inverse)] font-display text-[11.5px] font-extrabold uppercase tracking-[-0.02em] text-sport-400">
                                                        {initialsOf(s.name)}
                                                    </span>
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="truncate text-[14px] font-bold text-strong">
                                                        {s.name}
                                                    </div>
                                                    <div className="truncate text-[12px] text-subtle">
                                                        {s.goal}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Estado */}
                                        <td className="px-4 py-[10px] align-middle">
                                            <StatusBadge status={s.status} />
                                        </td>
                                        {/* Adherencia */}
                                        <td className="px-4 py-[10px] align-middle">
                                            <div className="flex items-center gap-[9px]">
                                                <span className="block h-1.5 w-[72px] overflow-hidden rounded-full bg-surface-sunken">
                                                    <span
                                                        className="block h-full rounded-full"
                                                        style={{
                                                            width: `${s.adherence}%`,
                                                            background:
                                                                s.adherence < 60
                                                                    ? 'var(--danger-500)'
                                                                    : 'var(--sport-500)',
                                                        }}
                                                    />
                                                </span>
                                                <span className="font-mono text-[12.5px] font-bold text-muted">
                                                    {s.adherence}%
                                                </span>
                                            </div>
                                        </td>
                                        {/* Semana */}
                                        <td className="px-4 py-[10px] align-middle font-mono text-[12.5px] text-muted">
                                            Sem {s.week}
                                        </td>
                                        {/* Última sesión */}
                                        <td className="px-4 py-[10px] align-middle text-[13.5px] text-muted">
                                            {lastSessionLabel(s.last)}
                                        </td>
                                        {/* chevron */}
                                        <td className="w-[40px] px-4 py-[10px] text-right align-middle text-[var(--ink-300)]">
                                            <ChevronRight className="ml-auto h-4 w-4" />
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── dt-bulkbar: barra de acción masiva ──────────────────────── */}
            {selIds.length > 0 && (
                <div className="flex shrink-0 items-center gap-[14px] bg-[var(--ink-950)] px-6 py-3 text-white">
                    <span className="text-[13.5px] font-bold">
                        {selIds.length} seleccionado{selIds.length > 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleAsignar}
                            className="eva-press inline-flex h-[34px] items-center gap-1.5 rounded-control bg-white/[0.12] px-[14px] text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                        >
                            <Dumbbell className="h-[15px] w-[15px]" /> Asignar programa
                        </button>
                        <button
                            type="button"
                            onClick={handleMensaje}
                            className="eva-press inline-flex h-[34px] items-center gap-1.5 rounded-control bg-white/[0.12] px-[14px] text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                        >
                            <MessageCircle className="h-[15px] w-[15px]" /> Mensaje
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            className="eva-press inline-flex h-[34px] items-center gap-1.5 rounded-control bg-white/[0.12] px-[14px] text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                        >
                            <Download className="h-[15px] w-[15px]" /> Exportar CSV
                        </button>
                        <AlertDialog>
                            <AlertDialogTrigger>
                                <span className="eva-press inline-flex h-[34px] items-center gap-1.5 rounded-control bg-[var(--danger-500)] px-[14px] text-[13px] font-bold text-white transition-colors hover:bg-[var(--danger-600)]">
                                    <Archive className="h-[15px] w-[15px]" /> Archivar
                                </span>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-surface-card border border-subtle text-body rounded-card">
                                <AlertDialogHeader>
                                    <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-control bg-[var(--danger-100)] text-[var(--danger-600)]">
                                        <AlertTriangle className="h-[22px] w-[22px]" />
                                    </div>
                                    <AlertDialogTitle className="font-display font-extrabold normal-case tracking-[-0.01em] text-strong">
                                        Archivar {selIds.length} alumnos
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-muted">
                                        Dejarán de tener acceso a su app hasta que los desarchives. Sus datos y su historial se conservan.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                {archiveError && (
                                    <p className="text-sm text-[var(--danger-600)] px-1">{archiveError}</p>
                                )}
                                <AlertDialogFooter className="gap-3">
                                    <AlertDialogCancel className="rounded-control">
                                        Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleArchive}
                                        disabled={isArchiving}
                                        className="bg-[var(--danger-500)] hover:bg-[var(--danger-600)] text-white rounded-control disabled:opacity-60"
                                    >
                                        {isArchiving ? 'Archivando...' : 'Archivar'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSel({})}
                        aria-label="Limpiar selección"
                        className="eva-press ml-auto flex h-[34px] w-[34px] items-center justify-center rounded-control bg-white/[0.12] text-white transition-colors hover:bg-white/20"
                    >
                        <X className="h-[15px] w-[15px]" />
                    </button>
                </div>
            )}
        </div>
    )
}
