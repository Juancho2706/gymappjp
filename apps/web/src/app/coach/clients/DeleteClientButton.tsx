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
import { deleteClientAction } from './actions'

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
                <div className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150">
                    <Trash2 className="w-4 h-4" />
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Eliminar alumno
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        ¿Confirmas que deseas eliminar a{' '}
                        <span className="text-foreground font-medium">{clientName}</span>?
                        Esta acción eliminará su cuenta y todos sus datos asociados. No se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error && (
                    <p className="text-sm text-destructive px-1">{error}</p>
                )}
                <AlertDialogFooter className="gap-3">
                    <AlertDialogCancel className="bg-secondary border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl">
                        Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isPending}
                        className="bg-destructive hover:bg-destructive/90 text-white rounded-xl disabled:opacity-60"
                    >
                        {isPending ? 'Eliminando...' : 'Sí, eliminar'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
