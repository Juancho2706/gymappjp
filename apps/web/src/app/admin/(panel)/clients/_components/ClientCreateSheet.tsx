'use client'

import { useActionState, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { createClientAction, type CreateClientResult } from '../_actions/client-actions'
import { generateTempPassword } from '../../_components/generateTempPassword'

interface Props {
    open: boolean
    onClose: () => void
    coaches: { id: string; full_name: string | null; brand_name: string | null; slug: string }[]
}

function CredentialRow({ label, value, href }: { label: string; value: string; href?: string }) {
    const [copied, setCopied] = useState(false)

    function copy() {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2">
            <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
                <p className="truncate font-mono text-xs text-neutral-100">{value}</p>
            </div>
            <div className="flex shrink-0 gap-1">
                <button
                    onClick={copy}
                    className="rounded p-1 text-neutral-400 hover:text-white transition-colors"
                    title="Copiar"
                >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {href && (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-neutral-400 hover:text-white transition-colors"
                        title="Abrir"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
        </div>
    )
}

export function ClientCreateSheet({ open, onClose, coaches }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [result, formAction] = useActionState<CreateClientResult | null, FormData>(
        createClientAction,
        null
    )
    const [password, setPassword] = useState('')

    const succeeded = result && 'success' in result && result.success

    function handleClose() {
        if (succeeded) router.refresh()
        onClose()
    }

    function fillPassword() {
        setPassword(generateTempPassword())
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    return (
        <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
            <SheetContent className="w-full sm:max-w-lg bg-neutral-950 border-neutral-800 text-white overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-white">
                        {succeeded ? 'Alumno creado' : 'Nuevo Alumno'}
                    </SheetTitle>
                </SheetHeader>

                {succeeded ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <p className="text-sm text-emerald-300">Alumno creado correctamente. Guarda las credenciales antes de cerrar.</p>
                        </div>

                        <div className="space-y-2">
                            <CredentialRow label="Email" value={result.email} />
                            <CredentialRow label="Contraseña temporal" value={result.tempPassword} />
                            <CredentialRow
                                label="URL de login del coach"
                                value={`${origin}${result.loginUrl}`}
                                href={result.loginUrl}
                            />
                        </div>
                        <p className="text-[11px] text-neutral-500">
                            El alumno deberá cambiar su contraseña en el primer inicio de sesión.
                        </p>

                        <SheetFooter className="pt-2">
                            <Button onClick={handleClose} className="w-full">
                                Cerrar y actualizar lista
                            </Button>
                        </SheetFooter>
                    </div>
                ) : (
                    <form
                        action={(fd) => startTransition(() => formAction(fd))}
                        className="mt-6 space-y-4"
                    >
                        <div>
                            <Label className="text-neutral-300 text-xs">Coach</Label>
                            <Select name="coach_id" required>
                                <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-800 text-white">
                                    <SelectValue placeholder="Seleccionar coach..." />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-white max-h-60">
                                    {coaches.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.brand_name || c.full_name || c.id}
                                            {c.full_name && c.brand_name ? ` (${c.full_name})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-neutral-300 text-xs">Nombre completo</Label>
                            <Input
                                name="full_name"
                                placeholder="María García"
                                className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                                required
                            />
                        </div>

                        <div>
                            <Label className="text-neutral-300 text-xs">Email</Label>
                            <Input
                                name="email"
                                type="email"
                                placeholder="maria@ejemplo.com"
                                className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                                required
                            />
                        </div>

                        <div>
                            <Label className="text-neutral-300 text-xs">Contraseña temporal</Label>
                            <div className="mt-1 flex gap-2">
                                <Input
                                    name="temp_password"
                                    type="text"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mín. 8 caracteres"
                                    className="bg-neutral-900 border-neutral-800 text-white font-mono placeholder:text-neutral-600"
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    onClick={fillPassword}
                                    className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
                                    title="Generar contraseña"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <Label className="text-neutral-300 text-xs">Teléfono <span className="text-neutral-600">(opcional)</span></Label>
                            <Input
                                name="phone"
                                type="tel"
                                placeholder="+56 9 1234 5678"
                                className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                            />
                        </div>

                        {result && 'error' in result && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                                <p className="text-sm text-red-400">{result.error}</p>
                            </div>
                        )}

                        <SheetFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose} className="text-neutral-300">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? 'Creando...' : 'Crear Alumno'}
                            </Button>
                        </SheetFooter>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
