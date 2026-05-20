'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, Copy, Loader2, UserPlus } from 'lucide-react'
import { createEnterpriseCoachAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Crear coach
        </button>
    )
}

export function CreateEnterpriseCoachForm({ orgSlug }: Props) {
    const formRef = useRef<HTMLFormElement>(null)
    const [state, action] = useActionState(
        async (_: unknown, formData: FormData) => createEnterpriseCoachAction(orgSlug, formData),
        null
    )

    useEffect(() => {
        if (state?.success) formRef.current?.reset()
    }, [state])

    const credentials = state?.success
        ? `Email: ${state.email}\nPassword: ${state.tempPassword}\nCodigo alumnos: ${state.inviteCode}`
        : ''

    return (
        <div className="space-y-4">
            <form ref={formRef} action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                    name="full_name"
                    required
                    placeholder="Nombre del coach"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <input
                    name="email"
                    type="email"
                    required
                    placeholder="coach@empresa.cl"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <select
                    name="role"
                    defaultValue="coach"
                    className="h-10 rounded-lg border border-border bg-background px-2 text-sm outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                    <option value="coach">Coach</option>
                    <option value="org_admin">Admin</option>
                </select>
                <input
                    name="temp_password"
                    placeholder="Password temporal opcional"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 md:col-span-2"
                />
                <div className="md:justify-self-end">
                    <SubmitButton />
                </div>
            </form>

            {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
            {state?.success && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Coach creado. Entrega estas credenciales si el email no está configurado en local.
                    </div>
                    <pre className="overflow-x-auto rounded-md bg-background/70 p-2 text-xs text-foreground">{credentials}</pre>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(credentials)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar credenciales
                    </button>
                </div>
            )}
        </div>
    )
}
