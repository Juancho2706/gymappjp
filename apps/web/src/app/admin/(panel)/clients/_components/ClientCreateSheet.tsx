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
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3 py-2">
            <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
                <p className="truncate font-mono text-xs text-strong">{value}</p>
            </div>
            <div className="flex shrink-0 gap-1">
                <button
                    onClick={copy}
                    className="rounded p-1 text-muted hover:text-strong transition-colors"
                    title="Copiar"
                >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-500)]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {href && (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted hover:text-strong transition-colors"
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
            <SheetContent className="w-full sm:max-w-lg bg-surface-card border-subtle text-strong overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-strong">
                        {succeeded ? 'Alumno creado' : 'Nuevo Alumno'}
                    </SheetTitle>
                </SheetHeader>

                {succeeded ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 rounded-lg border border-[var(--success-500)]/30 bg-[var(--success-500)]/15 px-3 py-2.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-500)]" />
                            <p className="text-sm text-[var(--success-500)]">Alumno creado correctamente. Guarda las credenciales antes de cerrar.</p>
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
                        <p className="text-[11px] text-muted">
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
                            <Label className="text-body text-xs">Coach</Label>
                            <Select name="coach_id" required>
                                <SelectTrigger className="mt-1 bg-surface-sunken border-subtle text-strong">
                                    <SelectValue placeholder="Seleccionar coach..." />
                                </SelectTrigger>
                                <SelectContent className="bg-surface-sunken border-subtle text-strong max-h-60">
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
                            <Label className="text-body text-xs">Nombre completo</Label>
                            <Input
                                name="full_name"
                                placeholder="María García"
                                className="mt-1 bg-surface-sunken border-subtle text-strong placeholder:text-muted"
                                required
                            />
                        </div>

                        <div>
                            <Label className="text-body text-xs">Email</Label>
                            <Input
                                name="email"
                                type="email"
                                placeholder="maria@ejemplo.com"
                                className="mt-1 bg-surface-sunken border-subtle text-strong placeholder:text-muted"
                                required
                            />
                        </div>

                        <div>
                            <Label className="text-body text-xs">Contraseña temporal</Label>
                            <div className="mt-1 flex gap-2">
                                <Input
                                    name="temp_password"
                                    type="text"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mín. 8 caracteres"
                                    className="bg-surface-sunken border-subtle text-strong font-mono placeholder:text-muted"
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    onClick={fillPassword}
                                    className="shrink-0 rounded-lg border border-subtle bg-surface-sunken px-2.5 text-muted hover:text-strong hover:border-strong transition-colors"
                                    title="Generar contraseña"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        <div>
                            <Label className="text-body text-xs">Teléfono <span className="text-muted">(opcional)</span></Label>
                            <Input
                                name="phone"
                                type="tel"
                                placeholder="+56 9 1234 5678"
                                className="mt-1 bg-surface-sunken border-subtle text-strong placeholder:text-muted"
                            />
                        </div>

                        {result && 'error' in result && (
                            <div className="rounded-lg border border-[var(--danger-500)]/30 bg-[var(--danger-500)]/15 px-3 py-2">
                                <p className="text-sm text-[var(--danger-500)]">{result.error}</p>
                            </div>
                        )}

                        <SheetFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose} className="text-body">
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
