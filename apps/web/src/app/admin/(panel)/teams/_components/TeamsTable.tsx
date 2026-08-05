'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Users, UserCheck, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TeamCreateSheet } from './TeamCreateSheet'
import { TeamEditSheet } from './TeamEditSheet'
import { MODULE_KEYS, MODULE_LABELS } from '../../_components/module-labels'
import type { AdminTeamRow } from '../_data/teams.queries'

const focusRing = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'

export function TeamsTable({ teams, search }: { teams: AdminTeamRow[]; search?: string }) {
    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<AdminTeamRow | null>(null)

    async function copyCode(code: string) {
        try {
            await navigator.clipboard.writeText(code)
            toast.success('Código copiado')
        } catch {
            toast.error('No se pudo copiar el código')
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    {teams.length} equipo(s){search ? ` para «${search}»` : ''}
                </p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Crear equipo
                </Button>
            </div>

            {teams.length === 0 ? (
                <div className="rounded-lg border border-subtle bg-surface-card px-4 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted" />
                    {search ? (
                        <>
                            <p className="mt-2 text-sm text-body">Sin equipos para «{search}»</p>
                            <p className="text-xs text-muted">Prueba con otro nombre o slug.</p>
                        </>
                    ) : (
                        <>
                            <p className="mt-2 text-sm text-body">No hay equipos todavía</p>
                            <p className="text-xs text-muted">Crea el primero para provisionar un pool de coaches.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-subtle">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-surface-card text-muted">
                                <tr className="text-left text-[11px] uppercase tracking-widest">
                                    <th className="px-4 py-2.5 font-medium">Equipo</th>
                                    <th className="px-4 py-2.5 font-medium">Owner</th>
                                    <th className="px-4 py-2.5 font-medium">Código</th>
                                    <th className="px-4 py-2.5 font-medium">Cupos</th>
                                    <th className="px-4 py-2.5 font-medium">Alumnos</th>
                                    <th className="px-4 py-2.5 font-medium">Módulos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-subtle)]">
                                {teams.map(t => {
                                    const activeMods = MODULE_KEYS.filter(k => t.enabled_modules[k] === true)
                                    return (
                                        <tr key={t.id} className="bg-surface-sunken transition-colors hover:bg-surface-card">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {/* Antes la fila entera era un <tr onClick> mudo: sin foco ni teclado. */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditTarget(t)}
                                                        aria-label={`Editar equipo ${t.name}`}
                                                        className={`rounded-md text-left font-medium text-strong transition-colors hover:text-[var(--sport-300)] ${focusRing}`}
                                                    >
                                                        {t.name}
                                                    </button>
                                                    {t.suspended_at && (
                                                        <span className="rounded-full border border-[var(--danger-500)]/30 bg-[var(--danger-500)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--danger-500)]">SUSPENDIDO</span>
                                                    )}
                                                </div>
                                                <p className="font-mono text-[11px] text-muted">/t/{t.slug}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                {t.owner_coach_id ? (
                                                    <Link
                                                        href={`/admin/coaches/${t.owner_coach_id}`}
                                                        className={`rounded-md text-[var(--sport-300)] transition-colors hover:underline ${focusRing}`}
                                                    >
                                                        {t.ownerName ?? 'Ver coach'}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {t.invite_code ? (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-strong">{t.invite_code}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyCode(t.invite_code as string)}
                                                            title="Copiar código"
                                                            aria-label={`Copiar código ${t.invite_code}`}
                                                            className={`rounded p-1 text-muted transition-colors hover:bg-surface-sunken hover:text-strong ${focusRing}`}
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 text-body">
                                                    <UserCheck className="h-3.5 w-3.5" /> {t.memberCount}/{t.seat_limit}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-body">{t.clientCount}</td>
                                            <td className="px-4 py-3">
                                                {activeMods.length === 0
                                                    ? <span className="text-muted">—</span>
                                                    : <span className="text-[11px] text-body">{activeMods.map(k => MODULE_LABELS[k]).join(', ')}</span>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <TeamCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
            <TeamEditSheet team={editTarget} onClose={() => setEditTarget(null)} />
        </div>
    )
}
