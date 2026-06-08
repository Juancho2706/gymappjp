'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Building2, ChevronDown, Dumbbell, GraduationCap, Loader2, UserCog } from 'lucide-react'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { selectWorkspaceAction } from '@/app/workspace/select/select.actions'
import { workspaceKey } from '@/services/auth/workspace.service'

interface Props {
    currentLabel: string
    workspaces: WorkspaceSummary[]
    variant?: 'dark' | 'brand'
    align?: 'up' | 'down'
}

function iconFor(type: string) {
    if (type === 'enterprise_staff') return UserCog
    if (type === 'enterprise_coach') return Building2
    if (type === 'coach_standalone') return Dumbbell
    return GraduationCap
}

export function WorkspaceSwitcher({ currentLabel, workspaces, variant = 'dark', align = 'up' }: Props) {
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

    const isBrand = variant === 'brand'

    const buttonClass = isBrand
        ? 'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors disabled:opacity-50'
        : 'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-50'

    const panelPositionClass = align === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'

    const panelClass = isBrand
        ? `absolute ${panelPositionClass} left-0 w-56 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl py-1 z-[60]`
        : `absolute ${panelPositionClass} left-0 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl py-1 z-[60]`

    const headingClass = isBrand
        ? 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
        : 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500'

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                disabled={pending}
                className={buttonClass}
                aria-label="Cambiar workspace"
            >
                {pending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <ChevronDown className="h-3 w-3" />}
                <span className="hidden sm:inline truncate max-w-[120px]">{currentLabel}</span>
            </button>

            {open && (
                <div className={panelClass}>
                    <p className={headingClass}>
                        Cambiar workspace
                    </p>
                    {workspaces.map(ws => {
                        const Icon = iconFor(ws.type)
                        const key = workspaceKey(ws)
                        const isCurrent = ws.isLastUsed
                        const itemClass = isBrand
                            ? `w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                                  isCurrent
                                      ? 'bg-sidebar-accent text-sidebar-foreground'
                                      : 'text-foreground hover:bg-sidebar-accent'
                              }`
                            : `w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors ${
                                  isCurrent
                                      ? 'bg-zinc-800 text-white'
                                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`
                        return (
                            <button
                                key={key}
                                onClick={() => handleSwitch(ws)}
                                className={itemClass}
                            >
                                <Icon
                                    className={isBrand ? 'h-4 w-4 shrink-0 text-muted-foreground' : 'h-4 w-4 shrink-0 text-zinc-400'}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{ws.label}</p>
                                    <p className={isBrand ? 'truncate text-[10px] text-muted-foreground capitalize' : 'truncate text-[10px] text-zinc-500 capitalize'}>
                                        {ws.type.replace(/_/g, ' ')}
                                    </p>
                                </div>
                                {isCurrent && (
                                    <span className={isBrand ? 'ml-auto text-[9px] font-bold text-primary shrink-0' : 'ml-auto text-[9px] font-bold text-emerald-400 shrink-0'}>Actual</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
