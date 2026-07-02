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
import { archiveClientAction, unarchiveClientAction } from './_actions/clients.actions'

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
                <div className="p-2 rounded-control text-muted hover:text-[var(--warning-600)] hover:bg-[var(--warning-100)] transition-all duration-150">
                    {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-surface-card border border-subtle text-body rounded-card">
                <AlertDialogHeader>
                    <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-control bg-[var(--warning-100)] text-[var(--warning-700)]">
                        <AlertTriangle className="h-[22px] w-[22px]" />
                    </div>
                    <AlertDialogTitle className="font-display font-extrabold normal-case tracking-[-0.01em] text-strong">
                        {isArchived ? 'Reactivar alumno' : 'Archivar alumno'}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted">
                        {isArchived ? (
                            <>
                                ¿Reactivar a{' '}
                                <span className="text-strong font-medium">{clientName}</span>?
                                Recuperará acceso a la plataforma y recibirá un correo de notificación.
                            </>
                        ) : (
                            <>
                                ¿Archivar a{' '}
                                <span className="text-strong font-medium">{clientName}</span>?
                                Perderá acceso a la plataforma temporalmente. Sus datos se conservan.
                                Recibirá un correo de notificación.
                            </>
                        )}
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
                        onClick={handleAction}
                        disabled={isPending}
                        className="bg-[var(--warning-500)] hover:bg-[var(--warning-600)] text-[var(--text-on-warning)] rounded-control disabled:opacity-60"
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
