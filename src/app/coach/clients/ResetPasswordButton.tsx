'use client'

import { useState, useTransition } from 'react'
import { KeyRound, Copy, Check } from 'lucide-react'
import { resetClientPasswordAction } from './actions'
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

interface ResetPasswordButtonProps {
    clientId: string
    clientName: string
}

export function ResetPasswordButton({ clientId, clientName }: ResetPasswordButtonProps) {
    const [error, setError] = useState<string>()
    const [tempPassword, setTempPassword] = useState<string>()
    const [isPending, startTransition] = useTransition()
    const [copied, setCopied] = useState(false)

    function handleReset(e: React.MouseEvent) {
        e.preventDefault()
        startTransition(async () => {
            const result = await resetClientPasswordAction(clientId)
            if (result.error) {
                setError(result.error)
            } else if (result.tempPassword) {
                setTempPassword(result.tempPassword)
            }
        })
    }

    function copyToClipboard() {
        if (tempPassword) {
            navigator.clipboard.writeText(tempPassword)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Si ya tenemos un password temporal generado, mostramos una UI diferente
    if (tempPassword) {
        return (
            <AlertDialog>
                <AlertDialogTrigger>
                    <div className="p-2 rounded-lg transition-all duration-150 text-indigo-500 hover:bg-indigo-500/10" title="Restablecer contraseña">
                        <KeyRound className="w-4 h-4" />
                    </div>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">
                            Contraseña restablecida
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            La nueva contraseña temporal para <span className="text-foreground font-medium">{clientName}</span> es:
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    
                    <div className="flex items-center justify-between bg-secondary p-4 rounded-xl my-2 border border-border">
                        <span className="text-2xl font-mono font-bold tracking-widest text-primary">{tempPassword}</span>
                        <button 
                            onClick={copyToClipboard}
                            className="p-2 rounded-lg bg-background hover:bg-muted transition-colors border border-border"
                            title="Copiar"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center">
                        El alumno deberá cambiar esta contraseña la próxima vez que inicie sesión.
                    </p>

                    <AlertDialogFooter className="mt-4">
                        <AlertDialogAction onClick={() => setTempPassword(undefined)} className="bg-primary hover:opacity-90 text-white rounded-xl w-full">
                            Entendido
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger>
                <div className="p-2 rounded-lg transition-all duration-150 text-indigo-500 hover:bg-indigo-500/10" title="Restablecer contraseña">
                    <KeyRound className="w-4 h-4" />
                </div>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border border-border text-foreground rounded-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">
                        Restablecer contraseña
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        ¿Generar una nueva contraseña temporal (PIN de 6 dígitos) para <span className="text-foreground font-medium">{clientName}</span>?
                        El alumno será forzado a cambiarla al ingresar.
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
                        onClick={handleReset}
                        disabled={isPending}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl disabled:opacity-60"
                    >
                        {isPending ? 'Generando...' : 'Generar PIN temporal'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
