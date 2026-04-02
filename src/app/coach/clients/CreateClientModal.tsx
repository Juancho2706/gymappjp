'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserPlus } from 'lucide-react'
import { createClientAction, type CreateClientState } from './actions'
import { cn } from '@/lib/utils'

const initialState: CreateClientState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className={cn(
                'w-full h-11 text-sm font-bold rounded-xl transition-all duration-200',
                'bg-gradient-to-r from-emerald-500 to-teal-600 text-white',
                'hover:shadow-lg hover:shadow-emerald-500/25',
                'disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2'
            )}
        >
            {pending ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando alumno...
                </>
            ) : (
                <>
                    <UserPlus className="w-4 h-4" />
                    Crear Alumno
                </>
            )}
        </button>
    )
}

interface CreateClientModalProps {
    open: boolean
    onClose: () => void
}

export function CreateClientModal({ open, onClose }: CreateClientModalProps) {
    const [state, formAction] = useActionState(createClientAction, initialState)
    const formRef = useRef<HTMLFormElement>(null)

    useEffect(() => {
        if (state.success) {
            formRef.current?.reset()
            onClose()
        }
    }, [state.success, onClose])

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="bg-card border border-border text-foreground max-w-md rounded-2xl shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-extrabold text-foreground">
                        Agregar Nuevo Alumno
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Se creará una cuenta con contraseña temporal. El alumno
                        deberá cambiarla en su primer ingreso.
                    </p>
                </DialogHeader>

                <form ref={formRef} action={formAction} className="space-y-4 mt-2">
                    {/* Full Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="full_name" className="text-sm text-foreground font-semibold">
                            Nombre completo
                        </Label>
                        <Input
                            id="full_name"
                            name="full_name"
                            placeholder="Juan González"
                            required
                            className="h-10 bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary"
                        />
                        {state.fieldErrors?.full_name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.full_name[0]}</p>
                        )}
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-sm text-foreground font-semibold">
                            Email del alumno
                        </Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="alumno@ejemplo.com"
                            required
                            className="h-10 bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary"
                        />
                        {state.fieldErrors?.email && (
                            <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p>
                        )}
                    </div>

                    {/* Teléfono */}
                    <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-sm text-foreground font-semibold">
                            Teléfono (WhatsApp)
                        </Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="+56xxxxxxxxx"
                            className="h-10 bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary"
                        />
                    </div>

                    {/* Fecha de Inicio */}
                    <div className="space-y-1.5">
                        <Label htmlFor="subscription_start_date" className="text-sm text-foreground font-semibold">
                            Inicio de mensualidad
                        </Label>
                        <Input
                            id="subscription_start_date"
                            name="subscription_start_date"
                            type="date"
                            className="h-10 bg-secondary border-border text-foreground rounded-xl focus:border-primary"
                        />
                    </div>

                    {/* Temp Password */}
                    <div className="space-y-1.5">
                        <Label htmlFor="temp_password" className="text-sm text-foreground font-semibold">
                            Contraseña temporal
                        </Label>
                        <Input
                            id="temp_password"
                            name="temp_password"
                            type="text"
                            placeholder="Mín. 8 caracteres"
                            required
                            minLength={8}
                            className="h-10 bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                            Comparte esta clave con tu alumno. Se le pedirá cambiarla al entrar.
                        </p>
                        {state.fieldErrors?.temp_password && (
                            <p className="text-xs text-destructive">
                                {state.fieldErrors.temp_password[0]}
                            </p>
                        )}
                    </div>

                    {state.error && (
                        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                            {state.error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-11 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            Cancelar
                        </button>
                        <div className="flex-1">
                            <SubmitButton />
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
