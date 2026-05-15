'use client'

import { useState, useTransition } from 'react'
import { Archive, ArchiveRestore, AlertTriangle } from 'lucide-react'
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
import { archiveClientAction, unarchiveClientAction } from './actions'

interface ArchiveClientButtonProps {
    clientId: string
    clientName: string
    isArchived: boolean
}

export function ArchiveClientButton({ clientId, clientName, isArchived }: ArchiveClientButtonProps) {
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    function handleAction() {
        setError(undefined)
        startTransition(async () => {
            const result = isArchived
                ? await unarchiveClientAction(clientId)
                : await archiveClientAction(clientId)
            if (result.error) setError(result.error)
        })
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <div className="p-2 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-all duration-150">
                    {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        {isArchived ? 'Reactivar alumno' : 'Archivar alumno'}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {isArchived ? (
                            <>
                                ¿Reactivar a{' '}
                                <span className="text-foreground font-medium">{clientName}</span>?
                                Recuperará acceso a la plataforma y recibirá un correo de notificación.
                            </>
                        ) : (
                            <>
                                ¿Archivar a{' '}
                                <span className="text-foreground font-medium">{clientName}</span>?
                                Perderá acceso a la plataforma temporalmente. Sus datos se conservan.
                                Recibirá un correo de notificación.
                            </>
                        )}
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
                        onClick={handleAction}
                        disabled={isPending}
                        className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl disabled:opacity-60"
                    >
                        {isPending
                            ? isArchived ? 'Reactivando...' : 'Archivando...'
                            : isArchived ? 'Reactivar' : 'Archivar'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
