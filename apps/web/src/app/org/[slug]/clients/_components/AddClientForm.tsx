'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, UserPlus } from 'lucide-react'
import { addClientToOrgAction } from '../../_actions/clients.actions'

interface Coach {
    id: string
    full_name: string | null
    slug: string | null
}

interface Props {
    orgSlug: string
    coaches: Coach[]
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Agregar
        </button>
    )
}

export function AddClientForm({ orgSlug, coaches }: Props) {
    const [state, action] = useActionState(
        async (_: unknown, formData: FormData) => addClientToOrgAction(orgSlug, formData),
        null
    )

    return (
        <form action={action} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                    name="full_name"
                    required
                    placeholder="Nombre completo"
                    className="h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input
                    name="email"
                    type="email"
                    required
                    placeholder="email@ejemplo.com"
                    className="h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input
                    name="phone"
                    type="tel"
                    placeholder="Teléfono (opcional)"
                    className="h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex gap-2">
                    <select
                        name="coach_id"
                        className="flex-1 h-9 px-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                        <option value="">Asignar a coach...</option>
                        {coaches.map(c => (
                            <option key={c.id} value={c.id}>{c.full_name ?? c.slug}</option>
                        ))}
                    </select>
                    <SubmitButton />
                </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
                <input
                    name="age_confirmed"
                    type="checkbox"
                    required
                    className="mt-0.5 h-4 w-4 rounded border-border accent-violet-600 shrink-0"
                />
                <span className="text-xs text-muted-foreground leading-snug">
                    Confirmo que el alumno tiene 14 años o más, o que cuento con el consentimiento
                    de su tutor legal (Ley 21.719).
                </span>
            </label>
            {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
            {state?.success && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-emerald-400">Alumno creado. Comparte estos accesos manualmente (no se envía email).</p>
                    {state.loginUrl && (
                        <p className="text-emerald-200/90"><span className="text-muted-foreground">Link:</span> <code className="font-mono">{state.loginUrl}</code></p>
                    )}
                    <p className="text-emerald-200/90"><span className="text-muted-foreground">Email:</span> <code className="font-mono">{state.email}</code></p>
                    {state.tempPassword && (
                        <p className="text-emerald-200/90"><span className="text-muted-foreground">Contraseña temporal:</span> <code className="font-mono">{state.tempPassword}</code></p>
                    )}
                    {!state.loginUrl && (
                        <p className="text-amber-300/90">Sin coach asignado aún — el alumno tendrá link de acceso al asignarse a un coach.</p>
                    )}
                </div>
            )}
        </form>
    )
}
