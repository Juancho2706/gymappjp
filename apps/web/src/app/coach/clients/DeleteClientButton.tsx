'use client'

import { useState, useTransition } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteClientAction } from './_actions/clients.actions'

interface DeleteClientButtonProps {
    clientId: string
    clientName: string
}

export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    function handleDelete() {
        startTransition(async () => {
            const result = await deleteClientAction(clientId)
            if (result.error) setError(result.error)
        })
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <div className="p-2 rounded-control text-muted hover:text-[var(--danger-600)] hover:bg-[var(--danger-100)] transition-all duration-150">
                    <Trash2 className="w-4 h-4" />
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-surface-card border border-subtle text-body rounded-card">
                <AlertDialogHeader>
                    <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-control bg-[var(--danger-100)] text-[var(--danger-600)]">
                        <AlertTriangle className="h-[22px] w-[22px]" />
                    </div>
                    <AlertDialogTitle className="font-display font-extrabold normal-case tracking-[-0.01em] text-strong">
                        Eliminar alumno
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted">
                        ¿Confirmas que deseas eliminar a{' '}
                        <span className="text-strong font-medium">{clientName}</span>?
                        Esta acción eliminará su cuenta y todos sus datos asociados. No se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error && (
                    <p className="text-sm text-[var(--danger-600)] px-1">{error}</p>
                )}
                <AlertDialogFooter className="gap-3">
                    <AlertDialogCancel className="rounded-control">
                        Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-[var(--cta-danger)] hover:opacity-90 text-white rounded-control disabled:opacity-60"
                    >
                        {isPending ? 'Eliminando...' : 'Sí, eliminar'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
