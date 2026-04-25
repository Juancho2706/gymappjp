'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ClientListItem } from '../../dashboard/_data/types'

interface Props {
    client: ClientListItem
    open: boolean
    onClose: () => void
}

export function ClientEditSheet({ client, open, onClose }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [isActive, setIsActive] = useState(client.is_active !== false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError('')
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        formData.append('clientId', client.id)
        formData.append('is_active', String(isActive))

        try {
            const res = await fetch('/admin/clients/update', {
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
                    <SheetTitle className="text-white">Editar Cliente</SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                        <Label className="text-neutral-300">Nombre completo</Label>
                        <Input name="full_name" defaultValue={client.full_name} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Email</Label>
                        <Input name="email" type="email" defaultValue={client.email} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Teléfono</Label>
                        <Input name="phone" defaultValue={''} className="bg-neutral-900 border-neutral-800 text-white mt-1" />
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-neutral-900/50 p-3">
                        <div>
                            <Label className="text-neutral-300">Activo</Label>
                            <p className="text-xs text-neutral-500">El alumno puede acceder a la app</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
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
