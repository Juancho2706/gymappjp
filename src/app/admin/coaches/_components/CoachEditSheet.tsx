'use client'

import { useState } from 'react'
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

interface Props {
    coach: CoachListItem
    open: boolean
    onClose: () => void
}

export function CoachEditSheet({ coach, open, onClose }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

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
                                <SelectItem value="starter">Starter</SelectItem>
                                <SelectItem value="pro">Pro</SelectItem>
                                <SelectItem value="elite">Elite</SelectItem>
                                <SelectItem value="scale">Scale</SelectItem>
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
                                <SelectItem value="yearly">Anual</SelectItem>
                            </SelectContent>
                        </Select>
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
