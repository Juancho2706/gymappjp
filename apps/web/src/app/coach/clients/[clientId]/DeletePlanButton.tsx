'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deletePlanAction } from '@/app/coach/builder/[clientId]/actions'

export function DeletePlanButton({ planId, clientId, planTitle }: {
    planId: string
    clientId: string
    planTitle: string
}) {
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    function handleDelete() {
        startTransition(async () => {
            const result = await deletePlanAction(planId, clientId)
            if (result.error) setError(result.error)
        })
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <div className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                    <Trash2 className="w-4 h-4" />
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">Eliminar rutina</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        ¿Eliminar <span className="text-foreground font-medium">&ldquo;{planTitle}&rdquo;</span>?
                        Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error && <p className="text-sm text-destructive px-1">{error}</p>}
                <AlertDialogFooter className="gap-3">
                    <AlertDialogCancel className="bg-secondary border-border text-muted-foreground hover:bg-muted rounded-xl">
                        Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isPending}
                        className="bg-destructive hover:bg-destructive/90 text-white rounded-xl disabled:opacity-60">
                        {isPending ? 'Eliminando...' : 'Eliminar'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
