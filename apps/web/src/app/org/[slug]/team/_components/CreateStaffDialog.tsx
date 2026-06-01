'use client'

import { useState, useTransition } from 'react'
import { Loader2, UserPlus, X, Copy, Check, Info } from 'lucide-react'
import { createEnterpriseCoachAction } from '../../_actions/org.actions'

const STAFF_ROLES = [
    { value: 'org_admin', label: 'Admin', description: 'Operación completa, gestión de equipo' },
    { value: 'ops', label: 'Operaciones', description: 'Coaches, alumnos, asignaciones' },
    { value: 'analyst', label: 'Analista', description: 'Solo lectura: reportes y pagos' },
    { value: 'brand_manager', label: 'Marca', description: 'Brand Studio únicamente' },
] as const

interface Props {
    orgSlug: string
}

interface SuccessResult {
    email: string
    tempPassword: string
    role: string
}

export function CreateStaffDialog({ orgSlug }: Props) {
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<SuccessResult | null>(null)
    const [copied, setCopied] = useState(false)
    const [pending, startTransition] = useTransition()

    function handleOpen() {
        setOpen(true)
        setError(null)
        setSuccess(null)
        setCopied(false)
    }

    function handleClose() {
        if (pending) return
        setOpen(false)
        setError(null)
        setSuccess(null)
        setCopied(false)
    }

    function handleSubmit(formData: FormData) {
        setError(null)
        startTransition(async () => {
            const res = await createEnterpriseCoachAction(orgSlug, formData)
            if (res?.error) {
                setError(res.error)
            } else if (res?.tempPassword) {
                setSuccess({ email: res.email ?? '', tempPassword: res.tempPassword, role: res.role ?? '' })
            }
        })
    }

    function copyPassword() {
        if (!success) return
        navigator.clipboard.writeText(success.tempPassword).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const roleLabel = STAFF_ROLES.find(r => r.value === success?.role)?.label ?? success?.role

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
                <UserPlus className="h-3.5 w-3.5" />
                Crear usuario
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) handleClose() }}
                >
                    <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl pb-safe border border-border bg-zinc-900 shadow-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-sm text-zinc-100">Crear usuario enterprise</h2>
                                <p className="text-xs text-zinc-500 mt-0.5">La cuenta entrará por /org/login</p>
                            </div>
                            <button onClick={handleClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {!success ? (
                            <form action={handleSubmit} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre completo</label>
                                    <input
                                        name="full_name"
                                        required
                                        minLength={2}
                                        maxLength={120}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none"
                                        placeholder="Nombre Apellido"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
                                    <input
                                        name="email"
                                        type="email"
                                        required
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none"
                                        placeholder="usuario@empresa.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Rol</label>
                                    <select
                                        name="role"
                                        defaultValue="ops"
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-amber-400/50 focus:outline-none"
                                    >
                                        {STAFF_ROLES.map(r => (
                                            <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-start gap-2 rounded-lg bg-zinc-800/50 border border-zinc-700 p-3">
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-500" />
                                    <p className="text-[11px] leading-4 text-zinc-500">
                                        Se genera contraseña temporal. Compartila fuera de EVA por canal seguro. El usuario puede cambiarla al ingresar.
                                    </p>
                                </div>

                                {error && (
                                    <p className="text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        disabled={pending}
                                        className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={pending}
                                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-300 transition-colors disabled:opacity-50"
                                    >
                                        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                                        Crear usuario
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">
                                    Usuario <strong>{success.email}</strong> creado como <strong>{roleLabel}</strong>.
                                </div>

                                <div>
                                    <p className="text-xs font-medium text-zinc-400 mb-1.5">Contraseña temporal</p>
                                    <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                                        <code className="flex-1 text-sm font-mono text-amber-300 select-all">{success.tempPassword}</code>
                                        <button
                                            onClick={copyPassword}
                                            className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                                            aria-label="Copiar contraseña"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2 rounded-lg bg-amber-400/5 border border-amber-400/20 p-3">
                                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400/70" />
                                    <p className="text-[11px] leading-4 text-amber-300/70">
                                        Compartí esta contraseña por canal seguro externo a EVA. El usuario puede cambiarla en su perfil.
                                    </p>
                                </div>

                                <button
                                    onClick={handleClose}
                                    className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                                >
                                    Listo
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
