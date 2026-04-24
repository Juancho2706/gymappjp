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
import { Loader2, UserPlus, MessageCircle, CheckCircle2 } from 'lucide-react'
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

    // Auto-close only when success but no phone (no WhatsApp CTA to show)
    useEffect(() => {
        if (state.success && !state.newClientPhone) {
            formRef.current?.reset()
            onClose()
        }
    }, [state.success, state.newClientPhone, onClose])

    const handleClose = () => {
        formRef.current?.reset()
        onClose()
    }

    // WhatsApp CTA step
    if (state.success && state.newClientPhone) {
        const digits = state.newClientPhone.replace(/\D/g, '')
        const message = `Hola ${state.clientName}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: ${state.loginUrl}`
        const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`

        return (
            <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
                <DialogContent className="bg-card border border-border text-foreground max-w-md rounded-2xl shadow-2xl">
                    <div className="flex flex-col items-center gap-5 py-4 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-foreground">
                                ¡Alumno creado!
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Enviá el link de acceso a{' '}
                                <span className="font-semibold text-foreground">{state.clientName}</span>{' '}
                                por WhatsApp.
                            </p>
                        </div>

                        <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleClose}
                            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#25D366]/25 transition hover:bg-[#1ebe5d] active:scale-[0.98]"
                        >
                            <MessageCircle className="h-5 w-5" />
                            Enviar link por WhatsApp
                        </a>

                        <button
                            type="button"
                            onClick={handleClose}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Omitir por ahora
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

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
