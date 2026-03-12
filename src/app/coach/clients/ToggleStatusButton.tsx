'use client'

import { useState, useTransition } from 'react'
import { PlayCircle, PauseCircle } from 'lucide-react'
import { toggleClientStatusAction } from './actions'
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

interface ToggleStatusButtonProps {
    clientId: string
    clientName: string
    isActive: boolean
}

export function ToggleStatusButton({ clientId, clientName, isActive }: ToggleStatusButtonProps) {
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    function handleToggle() {
        startTransition(async () => {
            const result = await toggleClientStatusAction(clientId, !isActive)
            if (result.error) setError(result.error)
        })
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <div className={`p-2 rounded-lg transition-all duration-150 ${isActive ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`} title={isActive ? "Pausar acceso" : "Reactivar acceso"}>
                    {isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">
                        {isActive ? 'Pausar acceso del alumno' : 'Reactivar acceso del alumno'}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {isActive 
                            ? `¿Confirmas que deseas pausar el acceso de ${clientName}? No podrá ver sus rutinas ni registrar datos, pero su historial se mantendrá intacto.`
                            : `¿Confirmas que deseas reactivar el acceso de ${clientName}? Volverá a tener acceso completo a la plataforma.`}
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
                        onClick={handleToggle}
                        disabled={isPending}
                        className={`${isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white rounded-xl disabled:opacity-60`}
                    >
                        {isPending ? 'Guardando...' : (isActive ? 'Pausar' : 'Reactivar')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
