'use client'

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'
import { QRCodeSVG } from 'qrcode.react'
import {
    Check,
    CheckCircle2,
    Copy,
    Loader2,
    Lock,
    Mail,
    MessageCircle,
    QrCode,
    UserPlus,
    X,
} from 'lucide-react'
import { personaNoun, type Persona } from '@eva/schemas'
import { EVA_BADGE_LABEL } from '@/lib/constants'
import { buildStudentLoginUrl } from '@/lib/coach/invite-code'
import { generateStudentTempPassword } from '@/lib/auth/temp-credentials'
import { useCaptureUpgradeGate } from '@/lib/posthog/events'
import { cn } from '@/lib/utils'
import {
    copyToClipboard,
    useCopiedFlag,
    INVITE_TINT_CLASS,
} from '../../dashboard/_components/invite/InviteStudentSheet'
// Emisor CANÓNICO de `/api/coach/onboarding-events` (dedupe server-side por índice único
// parcial). Se importa en vez de duplicar el `fetch`: los «cinco copys / cinco emisores» del
// onboarding viejo son justo lo que esta spec viene a matar.
import { postStepCompleted } from '../../dashboard/_lib/onboarding-telemetry.client'
import { createClientAction, type CreateClientState } from '../_actions/clients.actions'
import {
    buildInviteMessage,
    buildWhatsappUrl,
    DEFAULT_INVITE_CHANNEL,
    firstContentCopy,
    isReadyToInvite,
    stepperTitle,
    type InviteChannel,
} from '../_lib/add-student-invite'

/**
 * «Sumar un {alumno} en 3 pasos» — alta guiada INLINE (onboarding v2, TASKS F4.1).
 *
 * Reemplaza al modal en el PRIMER alta real: el coach nuevo no ve un formulario de 6 campos con
 * una contraseña que tiene que inventar, ve las tres cosas que le importan a la vez — qué datos
 * hacen falta, cómo le llega la invitación y qué va a ver su alumno con la marca del coach.
 * Las tres columnas están SIEMPRE a la vista en desktop (artboard T1); en móvil se apilan con una
 * cabecera de progreso. Sin tour, sin pop-ups, sin confeti (el único confeti es el aha).
 *
 * Escribe por la MISMA server action que el modal (`createClientAction`): el cupo, el scope
 * (standalone/team/org), la unicidad del correo y el correo de bienvenida siguen validándose y
 * ejecutándose en el servidor. Esta pantalla no crea ningún camino de escritura paralelo — y
 * cuando el servidor rechaza por cupo, pinta el mismo muro, no lo esquiva.
 */

export interface AddStudentBrand {
    /** Nombre de marca del coach (o su nombre si no tiene marca). */
    name: string
    logoUrl: string | null
    primaryColor: string
    /** Free y Starter llevan el sello «Hecho con EVA» en las superficies del alumno (pricing v3). */
    showsEvaBadge: boolean
}

export interface AddStudentFirstContent {
    /** Programa ya armado (plantilla aplicada o rutina del alumno de ejemplo). `null` = todavía nada. */
    programName: string | null
    /** Nombre del alumno de ejemplo de la persona (Matías / Ana / Pedro / Javiera). */
    demoName: string | null
}

export interface AddStudentStepperProps {
    persona: Persona
    /** Identificador público del coach (`invite_code`, o el slug legacy). Es el código del QR. */
    inviteCode: string
    brand: AddStudentBrand
    firstContent: AddStudentFirstContent
    /** Cierra el alta guiada y devuelve al directorio. */
    onClose: () => void
    /** Se dispara UNA vez con el id del alumno creado. */
    onCreated?: (clientId: string) => void
}

const initialState: CreateClientState = {}

interface ChannelDef {
    id: InviteChannel
    title: string
    body: string
    icon: typeof MessageCircle
}

function channelDefs(noun: string): ChannelDef[] {
    return [
        {
            id: 'whatsapp',
            title: 'Por WhatsApp',
            body: 'Le mandas el mensaje ya escrito con su link de acceso.',
            icon: MessageCircle,
        },
        {
            id: 'email',
            title: 'Por correo',
            body: `Le llega su acceso y una clave temporal que cambia al entrar.`,
            icon: Mail,
        },
        {
            id: 'code',
            title: 'En persona',
            body: `Tu ${noun} escanea el QR o escribe tu código y entra a tu app.`,
            icon: QrCode,
        },
    ]
}

/** Cabecera numerada de cada columna. El número es el paso; el check aparece cuando está resuelto. */
function StepHead({ n, title, hint, done }: { n: number; title: string; hint: string; done: boolean }) {
    return (
        <div className="flex items-start gap-3">
            <span
                aria-hidden="true"
                className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black',
                    done
                        ? 'bg-[var(--success-100)] text-[var(--success-700)]'
                        : 'bg-surface-sunken text-[var(--text-muted)]'
                )}
            >
                {done ? <Check className="size-4" strokeWidth={2.6} /> : n}
            </span>
            <div className="min-w-0">
                <h3 className="font-display text-[15px] font-black tracking-[-0.01em] text-strong">{title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>
            </div>
        </div>
    )
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
    return (
        <label htmlFor={htmlFor} className="text-[12.5px] font-bold text-strong">
            {children}
        </label>
    )
}

const inputClass = cn(
    'h-11 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5',
    'text-[14.5px] text-strong placeholder:text-[var(--text-muted)]',
    'outline-none transition-colors focus-visible:border-[var(--cta-fill)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
)

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={disabled || pending}
            className={cn(
                'eva-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-control',
                'bg-[var(--cta-fill)] px-5 font-ui text-[15px] font-bold text-[var(--text-on-sport)]',
                'shadow-[var(--glow-sport)] outline-none transition-opacity',
                'focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                'disabled:pointer-events-none disabled:opacity-[0.45] disabled:shadow-none md:w-auto'
            )}
        >
            {pending ? <Loader2 className="size-[18px] animate-spin" /> : <UserPlus className="size-[18px]" />}
            {pending ? 'Creando la cuenta…' : label}
        </button>
    )
}

/** Vista previa del login del alumno con la marca del coach (misma anatomía que «Tu marca en 60 s»). */
function StudentLoginPreview({ brand }: { brand: AddStudentBrand }) {
    const initials = (brand.name.trim() || 'EVA').slice(0, 2).toUpperCase()
    return (
        <div className="overflow-hidden rounded-card border border-subtle bg-surface-sunken">
            <div className="flex flex-col items-center gap-2 px-4 pb-3.5 pt-5">
                {brand.logoUrl ? (
                    <Image
                        src={brand.logoUrl}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                        className="size-11 rounded-full bg-white object-contain"
                    />
                ) : (
                    <span
                        aria-hidden="true"
                        className="flex size-11 items-center justify-center rounded-full text-[13px] font-black text-white"
                        style={{ background: brand.primaryColor }}
                    >
                        {initials}
                    </span>
                )}
                <span className="max-w-full truncate text-[13.5px] font-extrabold text-strong">
                    {brand.name.trim() || 'Tu marca'}
                </span>
                <div className="h-7 w-full rounded-control border border-subtle bg-surface-card" />
                <div className="h-7 w-full rounded-control border border-subtle bg-surface-card" />
                <div
                    className="flex h-8 w-full items-center justify-center rounded-control text-[12px] font-bold text-white"
                    style={{ background: brand.primaryColor }}
                >
                    Entrar
                </div>
            </div>
            {brand.showsEvaBadge && (
                <div className="border-t border-subtle py-1.5 text-center text-[10.5px] font-medium text-muted">
                    {EVA_BADGE_LABEL}
                </div>
            )}
        </div>
    )
}

/** Bloque del código + QR. Mismas reglas que `InviteStudentSheet` (QR sobre blanco literal). */
function CodeAndQr({ inviteCode, loginUrl }: { inviteCode: string; loginUrl: string }) {
    const [copied, setCopied] = useCopiedFlag()
    return (
        <div className="flex items-center gap-3.5">
            <div className="shrink-0 rounded-[12px] border border-black/10 p-[6px]" style={{ background: '#FFFFFF' }}>
                <QRCodeSVG value={loginUrl} size={72} level="M" />
            </div>
            <div className="min-w-0 flex-1">
                <div className={cn('rounded-control border px-3 py-2 text-center', INVITE_TINT_CLASS)}>
                    <span className="eva-mono pl-[0.2em] text-[22px] font-extrabold leading-none tracking-[0.2em] text-strong">
                        {inviteCode}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={async () => {
                        if (await copyToClipboard(inviteCode)) setCopied(true)
                    }}
                    className="eva-press mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card font-ui text-[13px] font-bold text-strong outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    {copied ? <Check className="size-4" strokeWidth={2.2} /> : <Copy className="size-4" strokeWidth={2.2} />}
                    {copied ? 'Código copiado' : 'Copiar código'}
                </button>
            </div>
        </div>
    )
}

export function AddStudentStepper({
    persona,
    inviteCode,
    brand,
    firstContent,
    onClose,
    onCreated,
}: AddStudentStepperProps) {
    const [state, formAction] = useActionState(createClientAction, initialState)
    const ph = usePostHog()
    const captureUpgradeGate = useCaptureUpgradeGate()
    const gateHitStateRef = useRef<CreateClientState | null>(null)
    const emittedIdRef = useRef<string | null>(null)
    const sectionRef = useRef<HTMLElement>(null)
    const headingRef = useRef<HTMLHeadingElement>(null)
    const uid = useId()

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [startDate, setStartDate] = useState('')
    const [ageConfirmed, setAgeConfirmed] = useState(false)
    const [channel, setChannel] = useState<InviteChannel>(DEFAULT_INVITE_CHANNEL)
    const [passwordCopied, setPasswordCopied] = useCopiedFlag()

    // Contraseña temporal generada UNA vez por alta: en el alta guiada el coach no tiene que
    // inventar una clave (el modal se la pedía). Se le muestra para dictarla, y el alumno la
    // cambia en su primer ingreso (`force_password_change`).
    const [tempPassword] = useState(() => generateStudentTempPassword())

    const noun = personaNoun(persona)
    const loginUrl = buildStudentLoginUrl(inviteCode)
    const channels = useMemo(() => channelDefs(noun), [noun])
    const content = useMemo(
        () => firstContentCopy(persona, firstContent),
        [persona, firstContent]
    )
    const draft = { fullName, email, ageConfirmed }
    const ready = isReadyToInvite(draft)
    const firstNameOnly = fullName.trim().split(/\s+/)[0] ?? ''
    const inviteMessage = buildInviteMessage(persona, { name: firstNameOnly, link: loginUrl })
    const whatsappUrl = buildWhatsappUrl({ persona, name: firstNameOnly, link: loginUrl, phone })

    // `upgrade_gate_hit` del cupo: mismo dedupe por IDENTIDAD del state que el modal — un segundo
    // intento sí cuenta como segundo choque, los re-renders del mismo rechazo no.
    useEffect(() => {
        if (!state.upgradeRequired) return
        if (gateHitStateRef.current === state) return
        gateHitStateRef.current = state
        captureUpgradeGate('client_limit', state.currentTier ?? 'free', state.currentLimit, state.activeCount)
    }, [state, captureUpgradeGate])

    // Alta hecha: UN evento de ledger por alta (dedupe duro server-side en `step_completed`) y el
    // canal en PostHog, que es donde se compara la conversión por canal. Guarda por id del alumno
    // para que los re-renders del éxito no lo repitan.
    useEffect(() => {
        if (!state.success || !state.newClientId) return
        if (emittedIdRef.current === state.newClientId) return
        emittedIdRef.current = state.newClientId
        void postStepCompleted('first_client', { channel, persona })
        ph?.capture('invite_sent', { channel, persona })
        onCreated?.(state.newClientId)
    }, [state.success, state.newClientId, channel, persona, ph, onCreated])

    const createdName = state.clientName ?? fullName.trim()

    // El alta guiada REEMPLAZA al directorio: sin mover el foco, el lector de pantalla se queda
    // leyendo un roster que ya no está y el teclado sigue tabulando la lista oculta. Se enfoca el
    // título de la vista actual (los 3 estados montan un solo `h2`) y se sube la vista al bloque.
    // `?.()` en `scrollIntoView`: jsdom no lo implementa y esto corre también en tests.
    useEffect(() => {
        headingRef.current?.focus()
        sectionRef.current?.scrollIntoView?.({ block: 'start' })
    }, [state.success, state.upgradeRequired])

    // ── Muro de cupo — el MISMO que ya existe, sin esquivarlo ────────────────────────────────
    if (state.upgradeRequired) {
        return (
            <section
                ref={sectionRef}
                aria-labelledby={`${uid}-wall`}
                className="mx-auto w-full max-w-[560px] px-4 py-10 text-center md:px-6"
            >
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--warning-100)]">
                    <Lock className="size-8 text-[var(--warning-700)]" />
                </div>
                <h2
                    ref={headingRef}
                    tabIndex={-1}
                    id={`${uid}-wall`}
                    className="mt-5 font-display text-[20px] font-black text-strong outline-none"
                >
                    Límite de {state.currentLimit} alumnos alcanzado
                </h2>
                <p className="mx-auto mt-2 max-w-[380px] text-[14px] text-muted">
                    Tus alumnos actuales no se ven afectados. Amplía tu plan para seguir sumando.
                </p>
                <div className="mx-auto mt-6 flex max-w-[300px] flex-col gap-2.5">
                    <Link
                        href="/coach/subscription"
                        onClick={() =>
                            ph?.capture('upgrade_initiated', {
                                gate: 'client_limit',
                                source: 'add_student_stepper',
                                current_limit: state.currentLimit,
                            })
                        }
                        className="eva-press inline-flex h-12 items-center justify-center rounded-control bg-[var(--cta-fill)] px-5 font-ui text-[15px] font-bold text-[var(--text-on-sport)]"
                    >
                        Ver planes
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            ph?.capture('upgrade_modal_dismissed', {
                                gate: 'client_limit',
                                current_limit: state.currentLimit,
                            })
                            onClose()
                        }}
                        className="h-11 text-[13.5px] font-semibold text-muted transition-colors hover:text-strong"
                    >
                        Ahora no
                    </button>
                </div>
            </section>
        )
    }

    // ── Alta hecha: la invitación por el canal elegido ───────────────────────────────────────
    if (state.success && state.newClientId) {
        return (
            <section ref={sectionRef} aria-labelledby={`${uid}-done`} className="w-full px-4 py-6 md:px-6">
                <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--success-100)]">
                        <CheckCircle2 className="size-6 text-[var(--success-700)]" />
                    </span>
                    <div className="min-w-0">
                        <h2
                            ref={headingRef}
                            tabIndex={-1}
                            id={`${uid}-done`}
                            className="font-display text-[20px] font-black tracking-[-0.02em] text-strong outline-none"
                        >
                            {createdName} ya tiene su cuenta
                        </h2>
                        <p className="mt-1 text-[13.5px] text-muted">
                            Le mandamos su acceso por correo. Ahora avísale por donde de verdad te lee.
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-card border border-subtle bg-surface-card p-4">
                        {channel === 'whatsapp' && (
                            <>
                                <h3 className="text-[14px] font-black text-strong">Mándaselo por WhatsApp</h3>
                                <p className="mt-1.5 rounded-control bg-surface-sunken p-3 text-[12.5px] leading-relaxed text-body">
                                    {inviteMessage}
                                </p>
                                <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => ph?.capture('invite_whatsapp_opened', { persona, source: 'add_student_stepper' })}
                                    className="eva-press mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-[#25D366] font-ui text-[15px] font-bold text-white"
                                >
                                    <MessageCircle className="size-5" />
                                    Abrir WhatsApp
                                </a>
                            </>
                        )}
                        {channel === 'email' && (
                            <>
                                <h3 className="text-[14px] font-black text-strong">Su correo va en camino</h3>
                                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                                    Enviado a <span className="font-semibold text-strong">{email.trim()}</span> con su
                                    link de acceso y la clave temporal. La cambia al entrar.
                                </p>
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="eva-mono flex-1 rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-[14px] font-bold text-strong">
                                        {tempPassword}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (await copyToClipboard(tempPassword)) setPasswordCopied(true)
                                        }}
                                        aria-label="Copiar la clave temporal"
                                        className="eva-press inline-flex size-11 items-center justify-center rounded-control border-[1.5px] border-default bg-surface-card text-strong"
                                    >
                                        {passwordCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                                    </button>
                                </div>
                            </>
                        )}
                        {channel === 'code' && (
                            <>
                                <h3 className="text-[14px] font-black text-strong">Muéstrale esto</h3>
                                <p className="mb-3 mt-1.5 text-[13px] leading-relaxed text-muted">
                                    Con el QR o el código entra directo a tu app, sin buscarte.
                                </p>
                                <CodeAndQr inviteCode={inviteCode} loginUrl={loginUrl} />
                            </>
                        )}
                    </div>

                    <div className="rounded-card border border-subtle bg-surface-card p-4">
                        <h3 className="text-[14px] font-black text-strong">Lo que ve al entrar</h3>
                        <div className="mt-3">
                            <StudentLoginPreview brand={brand} />
                        </div>
                    </div>
                </div>

                <div className="mt-5 flex flex-col gap-2.5 md:flex-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="eva-press inline-flex h-12 items-center justify-center rounded-control bg-[var(--cta-fill)] px-5 font-ui text-[15px] font-bold text-[var(--text-on-sport)] md:w-auto"
                    >
                        Ir a mi directorio
                    </button>
                </div>
            </section>
        )
    }

    // ── Los 3 pasos ──────────────────────────────────────────────────────────────────────────
    const step1Done = fullName.trim().length >= 2 && email.trim().length > 0 && ageConfirmed
    const progress: { n: number; label: string; done: boolean }[] = [
        { n: 1, label: 'Datos', done: step1Done },
        { n: 2, label: 'Invitación', done: step1Done },
        { n: 3, label: 'Lo que ve', done: step1Done },
    ]

    return (
        <section ref={sectionRef} aria-labelledby={`${uid}-title`} className="w-full px-4 py-5 md:px-6 md:py-7">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--cta-fill)]">
                        Alta guiada
                    </span>
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        id={`${uid}-title`}
                        className="mt-1 font-display text-[22px] font-black tracking-[-0.02em] text-strong outline-none md:text-[26px]"
                    >
                        {stepperTitle(persona)}
                    </h2>
                    <p className="mt-1.5 max-w-[560px] text-[13.5px] leading-snug text-muted">
                        Con el nombre y el correo alcanza: el resto lo completa tu {noun} al entrar.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar el alta guiada"
                    className="eva-press inline-flex size-10 shrink-0 items-center justify-center rounded-control border-[1.5px] border-default bg-surface-card text-strong"
                >
                    <X className="size-[18px]" />
                </button>
            </div>

            {/* Cabecera de progreso — solo móvil: en desktop las 3 columnas ya están a la vista. */}
            <ol aria-label="Progreso del alta" className="mt-4 flex items-center gap-1.5 md:hidden">
                {progress.map((p) => (
                    <li key={p.n} className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span
                            className={cn(
                                'flex size-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-black',
                                p.done
                                    ? 'bg-[var(--success-100)] text-[var(--success-700)]'
                                    : 'bg-surface-sunken text-[var(--text-muted)]'
                            )}
                        >
                            {p.done ? <Check className="size-3.5" strokeWidth={2.6} /> : p.n}
                        </span>
                        <span className="truncate text-[12px] font-bold text-muted">{p.label}</span>
                    </li>
                ))}
            </ol>

            <form action={formAction} className="mt-5">
                {/* Lo que el servidor necesita y el coach no tiene por qué escribir. */}
                <input type="hidden" name="temp_password" value={tempPassword} />
                <input type="hidden" name="invite_channel" value={channel} />

                <div className="grid gap-4 md:grid-cols-3">
                    {/* ── 1 · Datos mínimos ─────────────────────────────────────────────── */}
                    <div className="rounded-card border border-subtle bg-surface-card p-4">
                        <StepHead
                            n={1}
                            title="Datos mínimos"
                            hint="Nombre y correo. Nada más."
                            done={step1Done}
                        />
                        <div className="mt-4 flex flex-col gap-3">
                            <div className="flex flex-col gap-1.5">
                                <FieldLabel htmlFor={`${uid}-name`}>Nombre y apellido</FieldLabel>
                                <input
                                    id={`${uid}-name`}
                                    name="full_name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Juan González"
                                    autoComplete="off"
                                    required
                                    className={inputClass}
                                />
                                {state.fieldErrors?.full_name && (
                                    <p className="text-[12px] text-[var(--cta-danger)]">{state.fieldErrors.full_name[0]}</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <FieldLabel htmlFor={`${uid}-email`}>Correo</FieldLabel>
                                <input
                                    id={`${uid}-email`}
                                    name="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="alumno@correo.com"
                                    autoComplete="off"
                                    required
                                    className={inputClass}
                                />
                                {state.fieldErrors?.email && (
                                    <p className="text-[12px] text-[var(--cta-danger)]">{state.fieldErrors.email[0]}</p>
                                )}
                            </div>

                            <details className="rounded-control border border-subtle bg-surface-sunken px-3 py-2">
                                <summary className="cursor-pointer list-none text-[12.5px] font-bold text-muted marker:hidden">
                                    Opcional
                                </summary>
                                <div className="mt-3 flex flex-col gap-3 pb-1">
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel htmlFor={`${uid}-phone`}>Teléfono (WhatsApp)</FieldLabel>
                                        <input
                                            id={`${uid}-phone`}
                                            name="phone"
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="+56 9 1234 5678"
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <FieldLabel htmlFor={`${uid}-start`}>Inicio de mensualidad</FieldLabel>
                                        <input
                                            id={`${uid}-start`}
                                            name="subscription_start_date"
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className={inputClass}
                                        />
                                    </div>
                                </div>
                            </details>

                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    name="age_confirmed"
                                    type="checkbox"
                                    checked={ageConfirmed}
                                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                                    required
                                    className="mt-0.5 size-4 shrink-0 rounded border-default accent-[var(--cta-fill)]"
                                />
                                <span className="text-[11.5px] leading-snug text-muted">
                                    Tiene 14 años o más, o cuento con el consentimiento de su tutor legal (Ley 21.719).
                                </span>
                            </label>
                            {state.fieldErrors?.age_confirmed && (
                                <p className="text-[12px] text-[var(--cta-danger)]">{state.fieldErrors.age_confirmed[0]}</p>
                            )}
                        </div>
                    </div>

                    {/* ── 2 · Cómo le llega ─────────────────────────────────────────────── */}
                    <div className="rounded-card border border-subtle bg-surface-card p-4">
                        <StepHead n={2} title="Cómo le llega" hint="Elige por dónde lo invitas." done={step1Done} />
                        <fieldset className="mt-4">
                            <legend className="sr-only">Canal de invitación</legend>
                            <div className="flex flex-col gap-2.5">
                                {channels.map((c) => {
                                    const active = channel === c.id
                                    const Icon = c.icon
                                    return (
                                        <label
                                            key={c.id}
                                            className={cn(
                                                'flex cursor-pointer items-start gap-3 rounded-control border-[1.5px] p-3 transition-colors',
                                                active
                                                    ? cn('border-transparent', INVITE_TINT_CLASS)
                                                    : 'border-default bg-surface-card hover:bg-surface-sunken',
                                                'focus-within:ring-[3px] focus-within:ring-[var(--focus-ring)]'
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="invite_channel_choice"
                                                value={c.id}
                                                checked={active}
                                                onChange={() => setChannel(c.id)}
                                                className="sr-only"
                                            />
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control',
                                                    active
                                                        ? 'bg-[var(--cta-fill)] text-[var(--text-on-sport)]'
                                                        : 'bg-surface-sunken text-muted'
                                                )}
                                            >
                                                <Icon className="size-[17px]" strokeWidth={2.1} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 text-[13.5px] font-black text-strong">
                                                    {c.title}
                                                    {active && <Check className="size-4 text-[var(--cta-fill)]" strokeWidth={2.6} />}
                                                </span>
                                                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{c.body}</span>
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                        </fieldset>

                        {channel === 'whatsapp' && (
                            <p className="mt-3 rounded-control bg-surface-sunken p-3 text-[12px] leading-relaxed text-body">
                                {inviteMessage}
                            </p>
                        )}
                        {channel === 'email' && (
                            <p className="mt-3 text-[12px] leading-snug text-muted">
                                Clave temporal:{' '}
                                <span className="eva-mono font-bold text-strong">{tempPassword}</span> — la cambia al
                                entrar.
                            </p>
                        )}
                        {channel === 'code' && (
                            <div className="mt-3">
                                <CodeAndQr inviteCode={inviteCode} loginUrl={loginUrl} />
                                <p className="mt-2 text-[11.5px] leading-snug text-muted">
                                    Si alguien entra con tu código sin que lo hayas dado de alta, te llega como
                                    solicitud al directorio.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ── 3 · Lo que va a ver ───────────────────────────────────────────── */}
                    <div className="rounded-card border border-subtle bg-surface-card p-4">
                        <StepHead n={3} title="Lo que va a ver" hint="Tu marca, no la nuestra." done={step1Done} />
                        <div className="mt-4">
                            <StudentLoginPreview brand={brand} />
                        </div>
                        <div className="mt-3.5 rounded-control border border-subtle bg-surface-sunken p-3">
                            <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                                Su primer contenido
                            </span>
                            {content.title && (
                                <p className="mt-1 text-[13.5px] font-black text-strong">{content.title}</p>
                            )}
                            <p className="mt-1 text-[12px] leading-snug text-muted">{content.body}</p>
                        </div>
                    </div>
                </div>

                {state.error && (
                    <div
                        role="alert"
                        className={cn(
                            'mt-4 rounded-control border px-4 py-3 text-[13px]',
                            state.code === 'email_taken'
                                ? 'border-[var(--info-100)] bg-[var(--info-100)] text-[var(--info-600)]'
                                : 'border-[color-mix(in_oklab,var(--cta-danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--cta-danger)_10%,transparent)] text-[var(--cta-danger)]'
                        )}
                    >
                        {state.error}
                    </div>
                )}

                <div className="mt-5 flex flex-col gap-2.5 md:flex-row md:items-center">
                    <SubmitButton
                        label={firstNameOnly ? `Invitar a ${firstNameOnly}` : `Invitar a mi ${noun}`}
                        disabled={!ready}
                    />
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-12 rounded-control px-4 font-ui text-[13.5px] font-semibold text-muted transition-colors hover:text-strong"
                    >
                        Cancelar
                    </button>
                    {!ready && (
                        <p className="text-[12px] text-muted md:ml-1">
                            Falta el nombre, el correo o la confirmación de edad.
                        </p>
                    )}
                </div>
            </form>

            <p className="mt-4 text-[11.5px] text-muted">
                Tus {personaNoun(persona, true)} entran con su correo y cambian la clave temporal en su
                primer ingreso.
            </p>
        </section>
    )
}
