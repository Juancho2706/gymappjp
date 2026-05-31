'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Building2, ChevronDown, Dumbbell, GraduationCap, Loader2, UserCog } from 'lucide-react'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { selectWorkspaceAction } from '@/app/workspace/select/select.actions'
import { workspaceKey } from '@/services/auth/workspace.service'

interface Props {
    currentLabel: string
    workspaces: WorkspaceSummary[]
}

function iconFor(type: string) {
    if (type === 'enterprise_staff') return UserCog
    if (type === 'enterprise_coach') return Building2
    if (type === 'coach_standalone') return Dumbbell
    return GraduationCap
}

export function WorkspaceSwitcher({ currentLabel, workspaces }: Props) {
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()
    const ref = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [])

    // Only one workspace → no switcher needed
    if (workspaces.length <= 1) return null

    function handleSwitch(ws: WorkspaceSummary) {
        setOpen(false)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('workspace_key', workspaceKey(ws))
            await selectWorkspaceAction(fd)
        })
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50"
                aria-label="Cambiar workspace"
            >
                {pending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <ChevronDown className="h-3 w-3" />}
                <span className="hidden sm:inline truncate max-w-[120px]">{currentLabel}</span>
            </button>

            {open && (
                <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl py-1 z-50">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                        Cambiar workspace
                    </p>
                    {workspaces.map(ws => {
                        const Icon = iconFor(ws.type)
                        const key = workspaceKey(ws)
                        const isCurrent = ws.isLastUsed
                        return (
                            <button
                                key={key}
                                onClick={() => handleSwitch(ws)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                                    isCurrent
                                        ? 'bg-zinc-800 text-white'
                                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{ws.label}</p>
                                    <p className="truncate text-[10px] text-zinc-500 capitalize">
                                        {ws.type.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                {isCurrent && (
                                    <span className="ml-auto text-[9px] font-bold text-emerald-400 shrink-0">Actual</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
