'use client'

import { useActionState, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { createCoachAction, type CreateCoachResult } from '../_actions/coach-actions'
import { generateTempPassword } from '../../_components/generateTempPassword'

interface Props {
    open: boolean
    onClose: () => void
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

export function CoachCreateSheet({ open, onClose }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [result, formAction] = useActionState<CreateCoachResult | null, FormData>(
        createCoachAction,
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
                        {succeeded ? 'Coach creado' : 'Nuevo Coach'}
                    </SheetTitle>
                </SheetHeader>

                {succeeded ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <p className="text-sm text-emerald-300">Coach creado correctamente. Guarda las credenciales antes de cerrar.</p>
                        </div>

                        <div className="space-y-2">
                            <CredentialRow label="Email" value={result.email} />
                            <CredentialRow label="Contraseña temporal" value={result.tempPassword} />
                            <CredentialRow
                                label="URL del coach"
                                value={`${origin}/c/${result.slug}`}
                                href={`/c/${result.slug}`}
                            />
                            <CredentialRow
                                label="Dashboard"
                                value={`${origin}/coach/dashboard`}
                                href="/coach/dashboard"
                            />
                        </div>

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
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <Label className="text-neutral-300 text-xs">Nombre completo</Label>
                                <Input
                                    name="full_name"
                                    placeholder="Juan Rodríguez"
                                    className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                                    required
                                />
                            </div>
                            <div className="col-span-2">
                                <Label className="text-neutral-300 text-xs">Email</Label>
                                <Input
                                    name="email"
                                    type="email"
                                    placeholder="juan@ejemplo.com"
                                    className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                                    required
                                />
                            </div>
                            <div className="col-span-2">
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
                            <div className="col-span-2">
                                <Label className="text-neutral-300 text-xs">Nombre de marca</Label>
                                <Input
                                    name="brand_name"
                                    placeholder="Mi Marca Fitness"
                                    className="mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600"
                                    required
                                />
                            </div>
                            <div>
                                <Label className="text-neutral-300 text-xs">Plan</Label>
                                <Select name="subscription_tier" defaultValue="starter">
                                    <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-800 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                        <SelectItem value="starter">Starter</SelectItem>
                                        <SelectItem value="pro">Pro</SelectItem>
                                        <SelectItem value="elite">Elite</SelectItem>
                                        <SelectItem value="scale">Scale</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-neutral-300 text-xs">Facturación</Label>
                                <Select name="billing_cycle" defaultValue="monthly">
                                    <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-800 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                        <SelectItem value="monthly">Mensual</SelectItem>
                                        <SelectItem value="quarterly">Trimestral</SelectItem>
                                        <SelectItem value="annual">Anual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2">
                                <Label className="text-neutral-300 text-xs">Días de prueba</Label>
                                <Input
                                    name="trial_days"
                                    type="number"
                                    min={0}
                                    max={3650}
                                    defaultValue={0}
                                    className="mt-1 bg-neutral-900 border-neutral-800 text-white"
                                />
                                <p className="mt-1 text-[10px] text-neutral-500">
                                    0 = activo inmediatamente · &gt;0 = trialing hasta que venzan los días, luego debe reactivar (pagar)
                                </p>
                            </div>
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
                                {isPending ? 'Creando...' : 'Crear Coach'}
                            </Button>
                        </SheetFooter>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
