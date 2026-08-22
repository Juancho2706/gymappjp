'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { usePostHog } from 'posthog-js/react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserPlus, MessageCircle, CheckCircle2, Lock, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { createClientAction, type CreateClientState } from './_actions/clients.actions'
import { useAddStudentFlow } from './_components/add-student-flow-context'
import { useCaptureUpgradeGate } from '@/lib/posthog/events'
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
    /**
     * Precarga de los campos (`defaultValue`, no controlados: el coach puede corregir todo).
     * Lo usa el inbox «Solicitudes» para abrir el alta con los datos que dejó el solicitante.
     * Como son `defaultValue`, cambiar estos valores con el modal YA montado no repinta el form:
     * quien precarga debe montarlo por solicitud (o pasarle una `key`).
     */
    initialValues?: {
        full_name?: string | null
        email?: string | null
        phone?: string | null
    }
    /** Se dispara UNA vez con el id del alumno creado (cierra el lead que originó el alta). */
    onCreated?: (clientId: string) => void
}

export function CreateClientModal({ open, onClose, initialValues, onCreated }: CreateClientModalProps) {
    const [state, formAction] = useActionState(createClientAction, initialState)
    const formRef = useRef<HTMLFormElement>(null)
    const notifiedIdRef = useRef<string | null>(null)
    const ph = usePostHog()
    const captureUpgradeGate = useCaptureUpgradeGate()
    const gateHitStateRef = useRef<CreateClientState | null>(null)
    // Onboarding v2 (F4.1): dentro del directorio el alta guiada de 3 pasos sigue a un toque de
    // distancia. Fuera del directorio (dashboard) el flujo es inerte y este escape no se pinta.
    const addStudentFlow = useAddStudentFlow()

    // `upgrade_gate_hit` del cupo de alumnos: hasta Pricing v3 este gate NO se emitía en ninguna
    // superficie (solo existían `upgrade_modal_dismissed` / `upgrade_initiated`), así que el embudo
    // arrancaba después del muro y no se podía medir cuánta gente lo choca ni desde qué plan.
    //
    // Dedupe por IDENTIDAD del state: `useActionState` devuelve un objeto NUEVO por cada submit
    // rechazado, así que un segundo intento sí cuenta como segundo choque, pero los re-renders del
    // mismo rechazo (abrir/cerrar, repintados del padre) no lo duplican.
    useEffect(() => {
        if (!state.upgradeRequired) return
        if (gateHitStateRef.current === state) return
        gateHitStateRef.current = state
        captureUpgradeGate('client_limit', state.currentTier ?? 'free', state.currentLimit, state.activeCount)
    }, [state, captureUpgradeGate])

    // Aviso al dueño del modal. Va ANTES del auto-close y con guarda por id: el éxito con
    // teléfono deja el modal abierto en el paso de WhatsApp y el efecto correría en cada render.
    useEffect(() => {
        if (!state.success || !state.newClientId) return
        if (notifiedIdRef.current === state.newClientId) return
        notifiedIdRef.current = state.newClientId
        onCreated?.(state.newClientId)
    }, [state.success, state.newClientId, onCreated])

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
                                Envía el link de acceso a{' '}
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

    // Upgrade required — limit reached
    if (state.upgradeRequired) {
        return (
            <Dialog open={open} onOpenChange={(isOpen) => {
                if (!isOpen) {
                    ph?.capture('upgrade_modal_dismissed', { gate: 'client_limit', current_limit: state.currentLimit })
                    handleClose()
                }
            }}>
                <DialogContent className="bg-card border border-border text-foreground max-w-sm rounded-2xl shadow-2xl">
                    <div className="flex flex-col items-center gap-5 py-4 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
                            <Lock className="h-8 w-8 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-foreground">
                                Límite de {state.currentLimit} alumnos alcanzado
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Haz upgrade para seguir creciendo. Tus alumnos actuales no se ven afectados.
                            </p>
                        </div>
                        <Link
                            href="/coach/subscription"
                            onClick={() => {
                                ph?.capture('upgrade_initiated', { gate: 'client_limit', source: 'modal_cta', current_limit: state.currentLimit })
                                handleClose()
                            }}
                            className="w-full flex items-center justify-center h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            Ver planes →
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                ph?.capture('upgrade_modal_dismissed', { gate: 'client_limit', current_limit: state.currentLimit })
                                handleClose()
                            }}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Ahora no
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

                {addStudentFlow.guidedAvailable && (
                    <button
                        type="button"
                        onClick={addStudentFlow.startGuided}
                        className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-semibold text-primary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        <Sparkles className="h-4 w-4" />
                        Hazlo paso a paso
                    </button>
                )}

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
                            defaultValue={initialValues?.full_name ?? undefined}
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
                            defaultValue={initialValues?.email ?? undefined}
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
                            defaultValue={initialValues?.phone ?? undefined}
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

                    {/* Age confirmation — Ley 21.719 */}
                    <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                            name="age_confirmed"
                            type="checkbox"
                            required
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-emerald-500"
                        />
                        <span className="text-xs text-muted-foreground leading-snug">
                            Confirmo que el alumno tiene 14 años o más, o que cuento con el consentimiento de su tutor legal (Ley 21.719).
                        </span>
                    </label>
                    {state.fieldErrors?.age_confirmed && (
                        <p className="text-xs text-destructive">{state.fieldErrors.age_confirmed[0]}</p>
                    )}

                    {state.error && (
                        state.code === 'email_taken' ? (
                            // Correo con cuenta existente: informativo, no destructivo — el coach no
                            // hizo nada mal y hay un paso siguiente (soporte; invitación llegará en F2b).
                            <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 px-4 py-3 text-sm text-sky-600 dark:text-sky-400">
                                {state.error}
                            </div>
                        ) : (
                            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                                {state.error}
                            </div>
                        )
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
