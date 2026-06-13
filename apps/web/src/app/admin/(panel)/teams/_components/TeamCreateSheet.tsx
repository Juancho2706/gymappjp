'use client'

import { useActionState, useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { createTeamAction, type CreateTeamResult } from '../_actions/teams.actions'
import { generateTempPassword } from '../../_components/generateTempPassword'
import { MODULE_KEYS, MODULE_LABELS } from '../../_components/module-labels'

interface Props {
    open: boolean
    onClose: () => void
}

function CredentialRow({ label, value, href }: { label: string; value: string; href?: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2">
            <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
                <p className="truncate font-mono text-xs text-neutral-100">{value}</p>
            </div>
            <div className="flex shrink-0 gap-1">
                <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    className="rounded p-1 text-neutral-400 hover:text-white transition-colors" title="Copiar">
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-neutral-400 hover:text-white transition-colors" title="Abrir">
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
        </div>
    )
}

export function TeamCreateSheet({ open, onClose }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [result, formAction] = useActionState<CreateTeamResult | null, FormData>(createTeamAction, null)
    const [ownerMode, setOwnerMode] = useState<'existing' | 'new'>('existing')
    const [password, setPassword] = useState('')

    const succeeded = result && 'success' in result && result.success
    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    function handleClose() {
        if (succeeded) router.refresh()
        onClose()
    }

    const fieldCls = 'mt-1 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600'

    return (
        <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
            <SheetContent className="w-full sm:max-w-lg bg-neutral-950 border-neutral-800 text-white overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-white">{succeeded ? 'Equipo creado' : 'Nuevo Equipo'}</SheetTitle>
                </SheetHeader>

                {succeeded ? (
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <p className="text-sm text-emerald-300">Equipo creado. El owner ya puede sumar al resto desde su panel «Equipo».</p>
                        </div>
                        <div className="space-y-2">
                            <CredentialRow label="Link del equipo (alumnos)" value={`${origin}/t/${result.slug}/login`} href={`/t/${result.slug}/login`} />
                            {result.ownerEmail && <CredentialRow label="Email del owner" value={result.ownerEmail} />}
                            {result.tempPassword && <CredentialRow label="Contraseña temporal" value={result.tempPassword} />}
                            {result.tempPassword && <CredentialRow label="Login del owner (coach)" value={`${origin}/login`} href="/login" />}
                        </div>
                        <SheetFooter className="pt-2">
                            <Button onClick={handleClose} className="w-full">Cerrar y actualizar lista</Button>
                        </SheetFooter>
                    </div>
                ) : (
                    <form action={(fd) => startTransition(() => formAction(fd))} className="mt-6 space-y-4">
                        <input type="hidden" name="owner_mode" value={ownerMode} />

                        <div>
                            <Label className="text-neutral-300 text-xs">Nombre del equipo</Label>
                            <Input name="name" placeholder="Movida" className={fieldCls} required minLength={2} maxLength={80} />
                        </div>
                        <div>
                            <Label className="text-neutral-300 text-xs">Slug (opcional)</Label>
                            <Input name="slug" placeholder="auto desde el nombre" className={`${fieldCls} font-mono`} maxLength={46} />
                            <p className="mt-1 text-[10px] text-neutral-500">Los alumnos entran por /t/[slug]/login</p>
                        </div>
                        <div>
                            <Label className="text-neutral-300 text-xs">Cupos (seat_limit)</Label>
                            <Input name="seat_limit" type="number" min={1} max={500} defaultValue={30} className={fieldCls} required />
                        </div>

                        <div className="rounded-lg border border-neutral-800 p-3">
                            <p className="text-xs font-medium text-neutral-300">Owner del equipo</p>
                            <div className="mt-2 flex gap-2">
                                <Button type="button" size="sm" variant={ownerMode === 'existing' ? 'default' : 'outline'} onClick={() => setOwnerMode('existing')}>Coach existente</Button>
                                <Button type="button" size="sm" variant={ownerMode === 'new' ? 'default' : 'outline'} onClick={() => setOwnerMode('new')}>Cuenta nueva</Button>
                            </div>

                            {ownerMode === 'new' && (
                                <div className="mt-3">
                                    <Label className="text-neutral-300 text-xs">Nombre del owner</Label>
                                    <Input name="owner_full_name" placeholder="Ani Madrid" className={fieldCls} maxLength={120} />
                                </div>
                            )}
                            <div className="mt-3">
                                <Label className="text-neutral-300 text-xs">Email del owner</Label>
                                <Input name="owner_email" type="email" placeholder="owner@email.com" className={fieldCls} required />
                            </div>
                            {ownerMode === 'new' && (
                                <div className="mt-3">
                                    <Label className="text-neutral-300 text-xs">Contraseña temporal</Label>
                                    <div className="mt-1 flex gap-2">
                                        <Input name="owner_temp_password" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mín. 8 caracteres" className="bg-neutral-900 border-neutral-800 text-white font-mono placeholder:text-neutral-600" minLength={8} />
                                        <button type="button" onClick={() => setPassword(generateTempPassword())} className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors" title="Generar contraseña">
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border border-neutral-800 p-3">
                            <p className="text-xs font-medium text-neutral-300">Módulos habilitados</p>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                                {MODULE_KEYS.map(key => (
                                    <label key={key} className="flex items-center gap-2 text-sm text-neutral-200">
                                        <input type="checkbox" name={`module_${key}`} className="h-4 w-4 rounded border-neutral-700 bg-neutral-900" />
                                        {MODULE_LABELS[key]}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {result && 'error' in result && (
                            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                                <p className="text-sm text-red-400">{result.error}</p>
                            </div>
                        )}

                        <SheetFooter className="pt-2">
                            <Button type="button" variant="ghost" onClick={onClose} className="text-neutral-300">Cancelar</Button>
                            <Button type="submit" disabled={isPending}>{isPending ? 'Creando...' : 'Crear equipo'}</Button>
                        </SheetFooter>
                    </form>
                )}
            </SheetContent>
        </Sheet>
    )
}
