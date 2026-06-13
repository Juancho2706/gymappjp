'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { CoachListItem } from '../../dashboard/_data/types'
import { TIER_CONFIG } from '@eva/tiers'
import { MODULE_KEYS, MODULE_LABELS } from '../../_components/module-labels'
import { getCoachModulesAction } from '../_actions/coach-actions'

// Union COMPLETO derivado de las constantes (NO re-hardcodear — las 3 listas de tiers del admin divergieron).
// Incluye growth/scale (LEGACY, fuera de venta) porque el admin es la palanca para editar cuentas grandfathered.
const ALL_TIERS = Object.keys(TIER_CONFIG) as Array<keyof typeof TIER_CONFIG>

interface Props {
    coach: CoachListItem
    open: boolean
    onClose: () => void
}

export function CoachEditSheet({ coach, open, onClose }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    // Override universal del CEO (D5): se carga al abrir, sin tocar el RPC paginado de la lista (D5).
    const [modules, setModules] = useState<Record<string, boolean> | null>(null)

    useEffect(() => {
        if (!open) { setModules(null); return }
        let active = true
        getCoachModulesAction(coach.id)
            .then(m => { if (active) setModules(m) })
            .catch(() => { if (active) setModules({}) })
        return () => { active = false }
    }, [open, coach.id])

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError('')
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        formData.append('coachId', coach.id)

        try {
            const res = await fetch('/admin/coaches/update', {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)

            router.refresh()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-md bg-neutral-950 border-neutral-800 text-white">
                <SheetHeader>
                    <SheetTitle className="text-white">Editar Coach</SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <Label className="text-neutral-300">Nombre completo</Label>
                        <Input name="full_name" defaultValue={coach.full_name ?? ''} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Marca</Label>
                        <Input name="brand_name" defaultValue={coach.brand_name ?? ''} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Tier</Label>
                        <Select name="subscription_tier" defaultValue={coach.subscription_tier ?? undefined}>
                            <SelectTrigger className="bg-neutral-900 border-neutral-800 text-white mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800">
                                {ALL_TIERS.map(t => (
                                    <SelectItem key={t} value={t}>{TIER_CONFIG[t].label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-neutral-300">Estado</Label>
                        <Select name="subscription_status" defaultValue={coach.subscription_status ?? undefined}>
                            <SelectTrigger className="bg-neutral-900 border-neutral-800 text-white mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800">
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="trialing">Trialing</SelectItem>
                                <SelectItem value="canceled">Canceled</SelectItem>
                                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                                <SelectItem value="expired">Expired</SelectItem>
                                <SelectItem value="past_due">Past Due</SelectItem>
                                <SelectItem value="paused">Paused</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-neutral-300">Max Alumnos</Label>
                        <Input name="max_clients" type="number" defaultValue={coach.max_clients ?? 10} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Ciclo de Facturación</Label>
                        <Select name="billing_cycle" defaultValue={coach.billing_cycle ?? undefined}>
                            <SelectTrigger className="bg-neutral-900 border-neutral-800 text-white mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800">
                                <SelectItem value="monthly">Mensual</SelectItem>
                                <SelectItem value="quarterly">Trimestral</SelectItem>
                                <SelectItem value="annual">Anual</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-lg border border-neutral-800 p-3">
                        <p className="text-xs font-medium text-neutral-300">Módulos habilitados</p>
                        <p className="mt-0.5 text-[10px] text-neutral-500">Override del CEO — activa o desactiva módulos de pago para este coach.</p>
                        {modules === null ? (
                            <p className="mt-2 text-xs text-neutral-500">Cargando módulos...</p>
                        ) : (
                            <>
                                <input type="hidden" name="modules_present" value="1" />
                                <div className="mt-2 grid grid-cols-1 gap-2">
                                    {MODULE_KEYS.map(key => (
                                        <label key={key} className="flex items-center gap-2 text-sm text-neutral-200">
                                            <input type="checkbox" name={`module_${key}`} defaultChecked={modules[key] === true} className="h-4 w-4 rounded border-neutral-700 bg-neutral-900" />
                                            {MODULE_LABELS[key]}
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <SheetFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={onClose} className="text-neutral-300">
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Guardando...' : 'Guardar cambios'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    )
}
