'use client'

import { useState } from 'react'
import { ExternalLink, KeyRound, MoreHorizontal, RotateCcw, Shield, UserMinus, X } from 'lucide-react'
import { CoachEnterpriseActions } from './CoachEnterpriseActions'
import { RemoveCoachDialog } from './RemoveCoachDialog'

interface Coach {
    id: string
    name: string
}

interface Props {
    orgSlug: string
    memberId: string
    coachId: string
    coachName: string
    role: string
    clientCount: number
    otherCoaches: Coach[]
    inviteCode?: string | null
    canManageRole: boolean
    coachSlug?: string
}

/**
 * Mobile contextual menu for coach actions.
 * On desktop (lg+), renders nothing — actions show inline.
 * On mobile (<lg), renders a "⋯" button that opens a bottom sheet.
 */
export function CoachActionsMenu({
    orgSlug,
    memberId,
    coachId,
    coachName,
    role,
    clientCount,
    otherCoaches,
    inviteCode,
    canManageRole,
    coachSlug,
}: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            {/* Mobile trigger — hidden on lg+ where inline actions show */}
            <button
                onClick={() => setOpen(true)}
                className="lg:hidden flex items-center justify-center h-8 w-8 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                aria-label={`Acciones para ${coachName}`}
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>

            {open && (
                <div
                    className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
                    onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
                >
                    <div className="rounded-t-2xl border-t border-zinc-700 bg-zinc-900 pb-safe">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                            <div>
                                <p className="text-sm font-bold text-zinc-100">{coachName}</p>
                                <p className="text-xs text-zinc-500">{role} · {clientCount} alumno{clientCount !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-3 space-y-1">
                            {/* Performance link */}
                            <a
                                href={`/org/${orgSlug}/coaches/${coachId}`}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
                            >
                                <ExternalLink className="h-4 w-4 text-zinc-400" />
                                Ver performance
                            </a>

                            {/* Builder link */}
                            <a
                                href="/coach/workout-programs"
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
                            >
                                <Shield className="h-4 w-4 text-zinc-400" />
                                Abrir builder
                            </a>

                            {inviteCode && (
                                <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-400">
                                    <KeyRound className="h-4 w-4" />
                                    Código invitación: <span className="ml-1 font-mono font-bold text-zinc-200">{inviteCode}</span>
                                </div>
                            )}

                            {canManageRole && (
                                <div className="pt-2 border-t border-zinc-800">
                                    <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Administrar</p>
                                    <div className="flex items-center gap-2 px-4 py-2">
                                        <CoachEnterpriseActions
                                            orgSlug={orgSlug}
                                            memberId={memberId}
                                            coachId={coachId}
                                            role={role}
                                            canManageRole={canManageRole}
                                        />
                                    </div>
                                    {role !== 'org_owner' && (
                                        <div className="px-4 py-2">
                                            <RemoveCoachDialog
                                                orgSlug={orgSlug}
                                                memberId={memberId}
                                                coachId={coachId}
                                                coachName={coachName}
                                                clientCount={clientCount}
                                                otherCoaches={otherCoaches}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
