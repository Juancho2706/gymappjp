'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Palette, Upload, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateTeamBrandAction } from '../_actions/team.actions'

type Props = {
    teamId: string
    teamName: string
    primaryColor: string | null
    logoUrl: string | null
    canEdit: boolean
}

/**
 * Marca del TEAM (color + logo): lo que ven los alumnos en /t y el shell del coach en contexto
 * team. Editable por owner/co-gestor. NO es la marca personal del coach (esa vive en Mi Marca,
 * solo standalone).
 */
export function TeamBrandCard({ teamId, teamName, primaryColor, logoUrl, canEdit }: Props) {
    const [pending, startTransition] = useTransition()
    const [color, setColor] = useState(primaryColor ?? '#10B981')
    const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    function submit(fd: FormData) {
        setFeedback(null)
        startTransition(async () => {
            const res = await updateTeamBrandAction(teamId, fd)
            if (res?.error) { setFeedback({ type: 'error', msg: res.error }); return }
            setFeedback({ type: 'success', msg: 'Marca del equipo actualizada.' })
        })
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                    <Palette className="h-4 w-4 text-primary" /> Marca del equipo
                </h3>
                {!canEdit && <span className="text-xs text-muted-foreground">Solo owner/co-gestor</span>}
            </div>
            <p className="text-sm text-muted-foreground">
                Color y logo que ven los alumnos del pool y todo el equipo. (Tu marca personal de coach
                vive aparte, en tu cuenta standalone.)
            </p>

            <form
                action={(fd) => submit(fd)}
                className="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
                <div className="space-y-2">
                    <Label htmlFor="team-color">Color principal</Label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            disabled={!canEdit || pending}
                            className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1"
                            aria-label="Selector de color del equipo"
                        />
                        <Input
                            id="team-color"
                            name="primary_color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            disabled={!canEdit || pending}
                            maxLength={7}
                            pattern="^#[0-9a-fA-F]{6}$"
                            className="w-28 font-mono"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="team-logo">Logo (JPEG/PNG, máx 2 MB)</Label>
                    <div className="flex items-center gap-3">
                        {logoUrl && (
                            <span className="relative inline-block h-10 w-10 overflow-hidden rounded-lg border border-border">
                                <Image src={logoUrl} alt={teamName} fill className="object-contain p-1" />
                            </span>
                        )}
                        <input
                            ref={fileRef}
                            id="team-logo"
                            name="logo"
                            type="file"
                            accept="image/jpeg,image/png"
                            disabled={!canEdit || pending}
                            className="block w-full max-w-[220px] text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent"
                        />
                    </div>
                </div>

                <Button type="submit" disabled={!canEdit || pending} className="sm:ml-auto">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" /> Guardar marca</>}
                </Button>
            </form>

            {feedback && (
                <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'error'
                    ? 'border-red-500/20 bg-red-500/10 text-red-400'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'}`}>
                    {feedback.type === 'success' && <Check className="h-4 w-4" />}
                    {feedback.msg}
                </div>
            )}
        </div>
    )
}
