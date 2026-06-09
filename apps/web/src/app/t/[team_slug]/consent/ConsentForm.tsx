'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { grantTeamConsentAction, type TeamConsentState } from './_actions/consent.actions'
import { cn } from '@/lib/utils'

const initialState: TeamConsentState = {}

interface Props {
    teamSlug: string
    primaryColor: string
    brandName: string
}

function SubmitButton({ primaryColor, disabled }: { primaryColor: string; disabled: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending || disabled}
            className="w-full h-12 rounded-xl text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor, color: 'var(--primary-foreground, #ffffff)' }}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                </span>
            ) : (
                'Aceptar y continuar'
            )}
        </button>
    )
}

export default function ConsentForm({ teamSlug, primaryColor, brandName }: Props) {
    const [state, formAction] = useActionState(grantTeamConsentAction, initialState)
    const [accepted, setAccepted] = useState(false)

    return (
        <form action={formAction} className="bg-card border border-border rounded-2xl p-6 shadow-xl text-left">
            <input type="hidden" name="team_slug" value={teamSlug} />

            <p className="text-sm text-muted-foreground leading-relaxed">
                En <span className="font-medium text-foreground">{brandName}</span> trabaja un equipo de
                profesionales (entrenadores, nutrición, kinesiología y otros). Para entregarte una atención
                coordinada, necesitamos tu autorización para que el equipo pueda ver y registrar tus datos de
                salud y entrenamiento dentro de la plataforma.
            </p>

            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span style={{ color: primaryColor }}>•</span> Acceso multidisciplinario de los profesionales activos del equipo.</li>
                <li className="flex gap-2"><span style={{ color: primaryColor }}>•</span> Tratamiento de tus datos de salud para tu seguimiento.</li>
                <li className="flex gap-2"><span style={{ color: primaryColor }}>•</span> Puedes revocar este consentimiento cuando quieras desde tu perfil.</li>
            </ul>

            <label className={cn(
                'mt-5 flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                accepted ? 'border-transparent' : 'border-border'
            )}
                style={accepted ? { backgroundColor: `${primaryColor}12`, borderColor: `${primaryColor}40` } : undefined}
            >
                <input
                    type="checkbox"
                    name="accept"
                    checked={accepted}
                    onChange={e => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    style={{ accentColor: primaryColor }}
                />
                <span className="text-sm text-foreground">
                    Autorizo el acceso multidisciplinario y el tratamiento de mis datos de salud (Ley 21.719).
                </span>
            </label>

            {state?.error && (
                <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    {state.error}
                </div>
            )}

            <div className="mt-5">
                <SubmitButton primaryColor={primaryColor} disabled={!accepted} />
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
                <ShieldCheck className="w-3.5 h-3.5" /> Tus datos están protegidos y son confidenciales.
            </p>
        </form>
    )
}
