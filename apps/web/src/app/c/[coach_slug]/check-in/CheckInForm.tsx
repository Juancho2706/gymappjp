'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import {
    ArrowRight,
    Camera,
    Check,
    ChevronLeft,
    History,
    Loader2,
    Lock,
    Minus,
    Plus,
    RefreshCw,
    ShieldAlert,
    WifiOff,
    X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import {
    createCheckinUploadUrlsAction,
    submitCheckinAction,
    type CheckinState,
} from './_actions/check-in.actions'
import { formatRelativeDate } from '@/lib/date-utils'
import { humanizeStudentWriteError } from '@/lib/student-access'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { clearAppBadge } from '@/lib/client/app-badge'
import { SuccessWaveOverlay } from '@/components/ui/SuccessWaveOverlay'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const initialState: CheckinState = {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fireConfetti = (opts: object) => (import('canvas-confetti') as Promise<any>).then(m => (m.default ?? m)(opts))

export type LastCheckInRow = {
    weight: number | null
    energy_level: number | null
    created_at: string
} | null

interface Props {
    coachSlug: string
    /** Alumno dueño del borrador — la clave del draft es por coach + alumno. */
    studentId: string
    coachPrimaryColor: string
    lastCheckIn: LastCheckInRow
}

// ---------------------------------------------------------------------------
// Borrador del check-in (B2, QA 02-09)
// ---------------------------------------------------------------------------
// Los campos tipeables viven en `sessionStorage` (per-pestaña, se va solo al cerrarla) con clave
// por coach + alumno: un reload, una navegación accidental o un corte de red a media carga ya no
// le borran al alumno lo que escribió. Las FOTOS no viajan acá — un `File` no es serializable;
// sobreviven porque el árbol del alumno ya no se desmonta al caerse la red (ver NetworkProvider).
// Todo es fail-soft: en modo privado / storage bloqueado el formulario funciona igual que siempre.
const CHECKIN_DRAFT_PREFIX = 'eva:checkin-draft:'

type CheckInDraft = { weight?: string; notes?: string; energyLevel?: number }

function checkInDraftKey(coachSlug: string, studentId: string): string {
    return `${CHECKIN_DRAFT_PREFIX}${coachSlug}:${studentId}`
}

function readCheckInDraft(coachSlug: string, studentId: string): CheckInDraft | null {
    try {
        const raw = window.sessionStorage.getItem(checkInDraftKey(coachSlug, studentId))
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const { weight, notes, energyLevel } = parsed as CheckInDraft
        return {
            weight: typeof weight === 'string' ? weight : undefined,
            notes: typeof notes === 'string' ? notes : undefined,
            energyLevel: typeof energyLevel === 'number' && Number.isFinite(energyLevel) ? energyLevel : undefined,
        }
    } catch {
        return null
    }
}

function writeCheckInDraft(coachSlug: string, studentId: string, draft: CheckInDraft): void {
    try {
        window.sessionStorage.setItem(checkInDraftKey(coachSlug, studentId), JSON.stringify(draft))
    } catch {
        /* storage no disponible (modo privado/cuota): el borrador es un extra, nunca un requisito */
    }
}

function clearCheckInDraft(coachSlug: string, studentId: string): void {
    try {
        window.sessionStorage.removeItem(checkInDraftKey(coachSlug, studentId))
    } catch {
        /* idem */
    }
}

// 12MB: una foto de cámara moderna (HEIC/JPEG 12-48MP) pesa 3-8MB ANTES de comprimir; el gate
// del bucket (5MB) aplica solo al fallback sin comprimir — la conversión a JPEG de handleAction
// deja ~2MB. Rechazar acá al ELEGIR = el alumno nunca puede adjuntar (incidente jul-2026).
const MAX_SIZE = 12 * 1024 * 1024

// Peso tipeable — mismo contrato que el check-in de la app (`apps/mobile/app/alumno/(tabs)/check-in.tsx`)
// y que el atajo de peso del dashboard: se acepta coma o punto como separador decimal (el teclado
// decimal de es-CL entrega coma) y el rango válido es 20–400 kg con el MISMO copy de error. El stepper
// ±0,1 se conserva para el ajuste fino; el campo es para llegar de una a un peso lejano del prefill
// (un alumno de 102 kg necesitaba ~320 taps en «+»).
const WEIGHT_MIN = 20
const WEIGHT_MAX = 400
const WEIGHT_ERROR = 'Ingresa un peso válido (20–400 kg).'

/** Normaliza el separador decimal antes de `parseFloat` (espejo del server: check-in.actions.ts:152). */
function parseWeight(raw: string): number {
    return parseFloat(raw.replace(',', '.'))
}

function isWeightValid(raw: string): boolean {
    const w = parseWeight(raw)
    return !isNaN(w) && w >= WEIGHT_MIN && w <= WEIGHT_MAX
}

export function CheckInForm({ coachSlug, studentId, coachPrimaryColor, lastCheckIn }: Props) {
    const router = useRouter()
    const base = useBasePath(`/c/${coachSlug}`)
    const reducedMotion = useReducedMotion()
    const [state, formAction] = useActionState(submitCheckinAction, initialState)

    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
    const [direction, setDirection] = useState<1 | -1>(1)
    const [weight, setWeight] = useState(() =>
        lastCheckIn?.weight != null ? lastCheckIn.weight.toFixed(1) : '70.0'
    )
    const [weightError, setWeightError] = useState<string | null>(null)
    const [energyLevel, setEnergyLevel] = useState(lastCheckIn?.energy_level ?? 7)
    const [notes, setNotes] = useState('')
    const [frontFile, setFrontFile] = useState<File | null>(null)
    const [backFile, setBackFile] = useState<File | null>(null)
    const [frontPreview, setFrontPreview] = useState<string | null>(null)
    const [backPreview, setBackPreview] = useState<string | null>(null)
    const [fileErrors, setFileErrors] = useState<{ front?: string; back?: string }>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showCelebration, setShowCelebration] = useState(false)
    // La foto se comprime apenas se ELIGE (no al enviar): el problema se ve al seleccionar y el
    // submit queda liviano. preparedRef guarda la promesa del blob listo; jobSeq invalida
    // preparaciones viejas si el alumno re-elige rápido.
    const [optimizing, setOptimizing] = useState<{ front?: boolean; back?: boolean }>({})
    const preparedRef = useRef<{ front?: Promise<Blob | File | null>; back?: Promise<Blob | File | null> }>({})
    const jobSeq = useRef({ front: 0, back: 0 })

    // P16: al abrir el check-in, limpiar el badge del ícono de la PWA (ya no "espera" nada).
    useEffect(() => {
        clearAppBadge()
    }, [])

    // Borrador: se restaura DESPUÉS del montaje a propósito. Leer sessionStorage en el
    // inicializador de useState rompería la hidratación (el server no ve el storage del alumno).
    const [draftLoaded, setDraftLoaded] = useState(false)
    // Una vez enviado OK no se vuelve a escribir el borrador: el form ya no se toca y no queremos
    // resucitar la clave que acabamos de borrar.
    const draftSealed = useRef(false)

    useEffect(() => {
        const draft = readCheckInDraft(coachSlug, studentId)
        if (draft) {
            if (draft.weight !== undefined) setWeight(draft.weight)
            if (draft.notes !== undefined) setNotes(draft.notes)
            if (draft.energyLevel !== undefined) setEnergyLevel(draft.energyLevel)
        }
        setDraftLoaded(true)
    }, [coachSlug, studentId])

    useEffect(() => {
        // Nunca antes de restaurar: si no, los valores por defecto pisarían el borrador guardado.
        if (!draftLoaded || draftSealed.current) return
        writeCheckInDraft(coachSlug, studentId, { weight, notes, energyLevel })
    }, [draftLoaded, coachSlug, studentId, weight, notes, energyLevel])

    useEffect(() => {
        if (state.error != null || state.success) {
            setIsSubmitting(false)
        }
    }, [state.error, state.success])

    useEffect(() => {
        if (state.success) {
            // Enviado = el borrador ya no sirve para nada; se borra para que el próximo check-in
            // arranque limpio (y para no dejar notas viejas en el storage de la pestaña).
            draftSealed.current = true
            clearCheckInDraft(coachSlug, studentId)
            // El check-in NUNCA se pierde por una foto: si alguna no pudo subirse, se guarda igual
            // y acá se le dice al alumno (antes fallaba todo en silencio o abortaba el reporte).
            if (state.warning) {
                toast.warning(state.warning, { id: 'client-checkin-warn', duration: 8000 })
            } else {
                toast.success('Check-in enviado', { id: 'client-checkin-ok' })
            }
            // Delight: brand-themed wave overlay + confetti burst on a successful check-in.
            setShowCelebration(true)
            if (!reducedMotion) {
                void fireConfetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.5, y: 0.7 } })
            }
        }
        if (state.error) {
            // COACH_ACCOUNT_PAUSED (gate de suscripcion del coach) => copy humano, nunca el codigo crudo.
            toast.error(humanizeStudentWriteError(state.error), { id: 'client-checkin-err' })
        }
    }, [state.success, state.error, state.warning, reducedMotion, coachSlug, studentId])

    const frontInputRef = useRef<HTMLInputElement>(null)
    const backInputRef = useRef<HTMLInputElement>(null)

    const stepVariants = {
        hidden: (d: number) => ({
            x: reducedMotion ? 0 : d > 0 ? 40 : -40,
            opacity: reducedMotion ? 1 : 0,
        }),
        visible: {
            x: 0,
            opacity: 1,
            transition: { duration: reducedMotion ? 0 : 0.28 },
        },
        exit: (d: number) => ({
            x: reducedMotion ? 0 : d > 0 ? -40 : 40,
            opacity: reducedMotion ? 1 : 0,
            transition: { duration: reducedMotion ? 0 : 0.2 },
        }),
    }

    const goNext = () => {
        // El peso ahora es tipeable, así que puede quedar fuera de rango o a medio escribir: se corta
        // el avance acá además del `disabled` del botón, que no cubre un blur todavía sin procesar.
        if (currentStep === 1 && !isWeightValid(weight)) {
            setWeightError(WEIGHT_ERROR)
            return
        }
        setDirection(1)
        setCurrentStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
    }
    const goPrev = () => {
        setDirection(-1)
        setCurrentStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
    }

    const adjustWeight = (delta: number) => {
        setWeightError(null)
        // `parseWeight`: el valor puede venir tipeado con coma desde el teclado decimal.
        setWeight((w) => Math.max(0, (parseWeight(w) || 0) + delta).toFixed(1))
    }

    // Tipeo libre: se filtra a dígitos + separador decimal y NO se normaliza en caliente (normalizar
    // mientras se tipea le come el separador al alumno).
    const handleWeightInput = (raw: string) => {
        setWeightError(null)
        setWeight(raw.replace(/[^0-9.,]/g, ''))
    }

    // Al salir del campo: si el valor es válido se normaliza a 1 decimal (el mismo formato que produce
    // el stepper y que lee el resumen del paso 3); si no, se pinta el error inline.
    const handleWeightBlur = () => {
        if (isWeightValid(weight)) {
            setWeight(parseWeight(weight).toFixed(1))
            setWeightError(null)
        } else if (weight.trim().length > 0) {
            setWeightError(WEIGHT_ERROR)
        }
    }

    // Compresión BEST-EFFORT a JPEG (encode universal — convierte el HEIC de iPhone). Con
    // timeout: con ciertas fotos la promesa de browser-image-compression jamás resuelve
    // (incidente 2026-07-02) → a los 15s seguimos con el original. Devuelve null solo si el
    // original tampoco sirve (>5MB = límite duro del bucket).
    async function prepareForUpload(file: File): Promise<Blob | File | null> {
        try {
            const compressed = await Promise.race([
                imageCompression(file, {
                    maxSizeMB: 2,
                    maxWidthOrHeight: 1920,
                    useWebWorker: false,
                    fileType: 'image/jpeg',
                }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
            ])
            if (compressed) return compressed
            console.warn('[checkin] compresión colgada (timeout 15s), usando original')
        } catch (err) {
            console.warn('[checkin] compresión falló, usando original:', err)
        }
        if (file.size > 5 * 1024 * 1024) {
            console.warn('[checkin] original >5MB tras fallo de compresión, foto no utilizable')
            return null
        }
        return file
    }

    function validateAndSetFile(
        file: File | undefined,
        side: 'front' | 'back',
        setPreview: (u: string | null) => void,
        setFile: (f: File | null) => void
    ) {
        setFileErrors((e) => ({ ...e, [side]: undefined }))
        if (!file) return
        // Gate LAXO a propósito: solo bloquea no-imágenes evidentes. El HEIC de iPhone
        // ('image/heic'/'image/heif') y los picks con type VACÍO (iOS Files/algunos WebView no
        // reportan mime) DEBEN pasar — prepareForUpload los normaliza a JPEG. El allowlist
        // estricto acá era el bloqueo real del incidente jul-2026: rechazaba la foto ANTES de
        // que la conversión a JPEG pudiera correr.
        if (file.type && !file.type.startsWith('image/')) {
            setFileErrors((e) => ({
                ...e,
                [side]: 'El archivo no es una imagen. Usa una foto (JPG, PNG, HEIC…).',
            }))
            return
        }
        if (file.size > MAX_SIZE) {
            setFileErrors((e) => ({ ...e, [side]: 'La imagen pesa más de 12MB.' }))
            return
        }
        setFile(file)
        setPreview(URL.createObjectURL(file))
        // Optimización EN LA SELECCIÓN: si la foto no sirve, el alumno lo ve acá mismo — no
        // recién al enviar. jobSeq descarta el resultado si eligió otra foto en el intertanto.
        const myJob = ++jobSeq.current[side]
        setOptimizing((o) => ({ ...o, [side]: true }))
        preparedRef.current[side] = prepareForUpload(file).then((res) => {
            if (jobSeq.current[side] !== myJob) return res
            setOptimizing((o) => ({ ...o, [side]: false }))
            if (!res) {
                setFile(null)
                setPreview(null)
                setFileErrors((e) => ({
                    ...e,
                    [side]: 'No pudimos optimizar esta imagen y pesa más de 5MB. Prueba con otra.',
                }))
            }
            return res
        })
    }

    function clearPhoto(
        side: 'front' | 'back',
        setPreview: (u: string | null) => void,
        setFile: (f: File | null) => void,
        inputRef: React.RefObject<HTMLInputElement | null>
    ) {
        jobSeq.current[side]++
        preparedRef.current[side] = undefined
        setOptimizing((o) => ({ ...o, [side]: false }))
        setFileErrors((e) => ({ ...e, [side]: undefined }))
        setPreview(null)
        setFile(null)
        if (inputRef.current) inputRef.current.value = ''
    }

    const handleInputFocus = (e: React.FocusEvent<HTMLElement>) => {
        setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    }

    async function handleAction() {
        setIsSubmitting(true)
        try {
            const formData = new FormData()
            formData.set('weight', weight)
            formData.set('energy_level', String(energyLevel))
            formData.set('notes', notes)
            // Las fotos ya vienen comprimidas desde la SELECCIÓN. Acá se suben DIRECTO al bucket
            // (URL firmada, patrón espejo de exercise-media) y el POST del check-in viaja solo
            // con los PATHs: los bytes nunca pasan por eva-app.cl → inmune al WAF de Cloudflare
            // (403, incidente 2026-07-02) y al límite de 4.5MB de Vercel. Best-effort: la foto
            // que no sube se suelta con aviso; el check-in SIEMPRE sale.
            const slots: { side: 'front' | 'back'; field: 'photo_path' | 'back_photo_path'; blob: Blob | File }[] = []
            let fotosDescartadas = 0
            if (frontFile) {
                const blob = await preparedRef.current.front
                if (blob) slots.push({ side: 'front', field: 'photo_path', blob })
                else fotosDescartadas++
            }
            if (backFile) {
                const blob = await preparedRef.current.back
                if (blob) slots.push({ side: 'back', field: 'back_photo_path', blob })
                else fotosDescartadas++
            }

            if (slots.length > 0) {
                const res = await createCheckinUploadUrlsAction(
                    slots.map((s) => ({ variant: s.side, contentType: s.blob.type || 'image/jpeg' }))
                )
                if (res.tickets) {
                    for (const s of slots) {
                        const ticket = res.tickets.find((t) => t.variant === s.side)
                        if (!ticket) {
                            fotosDescartadas++
                            continue
                        }
                        try {
                            const up = await fetch(ticket.signedUrl, {
                                method: 'PUT',
                                body: s.blob,
                                headers: { 'Content-Type': s.blob.type || 'image/jpeg' },
                                ...(typeof AbortSignal.timeout === 'function'
                                    ? { signal: AbortSignal.timeout(45_000) }
                                    : {}),
                            })
                            if (up.ok) formData.set(s.field, ticket.path)
                            else {
                                fotosDescartadas++
                                console.warn(`[checkin] upload directo ${s.side} rechazado:`, up.status)
                            }
                        } catch (err) {
                            fotosDescartadas++
                            console.warn(`[checkin] upload directo ${s.side} falló:`, err)
                        }
                    }
                } else {
                    fotosDescartadas += slots.length
                    console.warn('[checkin] no se pudieron firmar URLs de subida:', res.error)
                }
            }

            if (fotosDescartadas > 0) {
                toast.warning(
                    fotosDescartadas === 1
                        ? 'Una foto no pudo subirse y va a omitirse; tu check-in se envía igual.'
                        : 'Las fotos no pudieron subirse y van a omitirse; tu check-in se envía igual.',
                    { id: 'client-checkin-warn', duration: 8000 }
                )
            }
            startTransition(() => formAction(formData))
        } catch {
            // Nunca morir en silencio: el alumno necesita saber que NO se envió (incidente jun-2026:
            // el catch mudo dejaba el check-in bloqueado sin señal alguna).
            toast.error('No se pudo enviar el check-in. Intenta de nuevo.', { id: 'client-checkin-err' })
            setIsSubmitting(false)
        }
    }

    const photoCount = [frontFile, backFile].filter(Boolean).length

    if (state.success) {
        return (
            <>
                <SuccessWaveOverlay
                    show={showCelebration}
                    message="¡Check-in enviado!"
                    accentColor={coachPrimaryColor}
                    onComplete={() => setShowCelebration(false)}
                />
                <motion.div
                    initial={reducedMotion ? false : { scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reducedMotion ? { duration: 0 } : springs.elastic}
                    className="flex min-h-[60dvh] flex-col items-center justify-center px-8 pb-16 text-center"
                >
                    <div className="mb-5 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[var(--success-500)] text-white shadow-[0_8px_28px_rgba(31,184,119,0.4)]">
                        <Check className="h-11 w-11" />
                    </div>
                    <h1 className="font-display text-[27px] font-black tracking-tight text-strong">
                        ¡Check-in enviado!
                    </h1>
                    <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-muted">
                        Tu coach recibió tu actualización mensual. Ajustará tu plan según tu progreso.
                    </p>
                    <Button
                        type="button"
                        variant="sport"
                        size="lg"
                        onClick={() => router.push(`${base}/dashboard`)}
                        className="mt-7 w-full max-w-[280px]"
                    >
                        Volver al inicio
                    </Button>
                </motion.div>
            </>
        )
    }

    return (
        <div className="px-5 pb-6">
            {/* TopBar */}
            <div className="flex items-center gap-3 px-0 pb-2.5 pt-1.5">
                <Link
                    href={`${base}/dashboard`}
                    aria-label="Atrás"
                    className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-strong"
                >
                    <ChevronLeft className="h-5 w-5" />
                </Link>
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                        Paso {currentStep} de 3
                    </div>
                    <h1 className="font-display text-[26px] font-black leading-tight tracking-tight text-strong">
                        Check-in mensual
                    </h1>
                </div>
            </div>

            {/* stepper */}
            <div className="mb-4 flex gap-1.5">
                {[1, 2, 3].map((n) => (
                    <motion.div
                        key={n}
                        animate={{
                            flex: n === currentStep ? 1.6 : 1,
                            backgroundColor: n <= currentStep ? coachPrimaryColor : 'var(--ink-200)',
                        }}
                        className="h-1.5 rounded-full"
                        transition={reducedMotion ? { duration: 0 } : springs.snappy}
                    />
                ))}
            </div>

            {/* medical disclaimer */}
            <div className="mb-4 flex items-center gap-2 rounded-control border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2.5 text-[var(--warning-600)]">
                <ShieldAlert className="h-[15px] w-[15px] shrink-0" />
                <span className="text-[11.5px] leading-snug">
                    EVA no es un dispositivo médico ni sustituye consejo profesional.
                </span>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
                {currentStep === 1 && (
                    <motion.div
                        key="step1"
                        custom={direction}
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        {/* last check-in */}
                        {lastCheckIn ? (
                            <Card padding="md" variant="sunken" className="mb-3.5 flex-row items-center gap-3">
                                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-card text-sport-600">
                                    <History className="h-[18px] w-[18px]" />
                                </span>
                                <div className="flex-1">
                                    <div className="text-[11.5px] font-bold text-muted">Tu último check-in</div>
                                    <div className="text-[13.5px] font-semibold text-strong">
                                        {lastCheckIn.weight != null ? `${lastCheckIn.weight} kg` : '—'} · Energía{' '}
                                        {lastCheckIn.energy_level ?? '—'}/10 ·{' '}
                                        {formatRelativeDate(lastCheckIn.created_at.slice(0, 10))}
                                    </div>
                                </div>
                            </Card>
                        ) : (
                            <Card padding="md" variant="sunken" className="mb-3.5 flex-row items-center gap-3">
                                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface-card text-sport-600">
                                    <History className="h-[18px] w-[18px]" />
                                </span>
                                <div className="flex-1">
                                    <div className="text-[11.5px] font-bold text-muted">Tu primer check-in</div>
                                    <div className="text-[13.5px] font-semibold text-strong">
                                        Registra peso y energía para empezar.
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Peso actual */}
                        <Card padding="lg" className="mb-3.5 gap-3">
                            <div className="text-[13px] font-semibold text-strong">Peso actual</div>
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    type="button"
                                    aria-label="Menos"
                                    onClick={() => adjustWeight(-0.1)}
                                    className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-default bg-surface-card"
                                    style={{ color: 'var(--ink-700)' }}
                                >
                                    <Minus className="h-5 w-5" />
                                </button>
                                <div className="flex items-baseline gap-1">
                                    {/* El numeral ES el campo: el subrayado de 1,5px es la única pista de
                                        que se puede escribir y se tiñe con la marca del coach al enfocar.
                                        Ancho fijo de 128px = el máximo que entra en la fila junto a los dos
                                        botones de 48 y el "kg" en un viewport de 360px, y alcanza para
                                        "102.0". */}
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={weight}
                                        onChange={(e) => handleWeightInput(e.target.value)}
                                        onFocus={(e) => e.currentTarget.select()}
                                        onBlur={handleWeightBlur}
                                        maxLength={5}
                                        aria-label="Peso actual en kilos"
                                        aria-invalid={weightError != null}
                                        aria-describedby={weightError ? 'checkin-weight-error' : undefined}
                                        className={`w-32 border-b-[1.5px] bg-transparent text-center font-display text-5xl font-black tabular-nums tracking-[-0.03em] text-strong outline-none transition-colors ${
                                            weightError
                                                ? 'border-[var(--danger-600)]'
                                                : 'border-default focus:border-[var(--theme-primary)]'
                                        }`}
                                    />
                                    <span className="text-lg font-semibold text-muted">kg</span>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Más"
                                    onClick={() => adjustWeight(0.1)}
                                    className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-default bg-surface-card"
                                    style={{ color: 'var(--ink-700)' }}
                                >
                                    <Plus className="h-5 w-5" />
                                </button>
                            </div>
                            {weightError ? (
                                <p
                                    id="checkin-weight-error"
                                    role="alert"
                                    className="text-center text-[11.5px] font-semibold text-[var(--danger-600)]"
                                >
                                    {weightError}
                                </p>
                            ) : null}
                        </Card>

                        {/* Nivel de energía */}
                        <Card padding="lg" className="mb-4 gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-strong">Nivel de energía</span>
                                <span className="font-display text-base font-black tabular-nums tracking-[-0.03em] text-sport-600">
                                    {energyLevel}
                                    <span className="text-xs font-semibold text-muted">/10</span>
                                </span>
                            </div>
                            <input
                                id="energy_level"
                                type="range"
                                min={1}
                                max={10}
                                value={energyLevel}
                                onChange={(e) => setEnergyLevel(Number(e.target.value))}
                                className="w-full"
                                style={{ accentColor: coachPrimaryColor }}
                            />
                        </Card>

                        <Button
                            type="button"
                            variant="sport"
                            size="lg"
                            onClick={goNext}
                            // Cubre vacío E inválido. El inválido se apaga vía `weightError` (no vía
                            // `isWeightValid` directo) para no dejar un botón muerto sin explicación:
                            // mientras el alumno escribe el botón sigue vivo, el tap dispara el guard de
                            // `goNext`, aparece el error inline y RECIÉN ahí queda deshabilitado.
                            disabled={!weight || weightError != null}
                            className="w-full"
                        >
                            Continuar <ArrowRight className="h-4 w-4" />
                        </Button>
                    </motion.div>
                )}

                {currentStep === 2 && (
                    <motion.div
                        key="step2"
                        custom={direction}
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        <p className="mb-3.5 text-[13.5px] leading-relaxed text-muted">
                            Las fotos son opcionales pero ayudan a tu coach a ver tu evolución.
                        </p>

                        <input
                            ref={frontInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) =>
                                validateAndSetFile(e.target.files?.[0], 'front', setFrontPreview, setFrontFile)
                            }
                        />
                        <input
                            ref={backInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) =>
                                validateAndSetFile(e.target.files?.[0], 'back', setBackPreview, setBackFile)
                            }
                        />

                        <div className="mb-2 flex items-start gap-2.5">
                            {/* Foto frontal */}
                            <div className="min-w-0 flex-1">
                                {frontPreview ? (
                                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-control border-2 border-sport-500 bg-[var(--ink-950)]">
                                        <Image src={frontPreview} alt="Foto frontal" fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                                        {optimizing.front && (
                                            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Optimizando…
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => clearPhoto('front', setFrontPreview, setFrontFile, frontInputRef)}
                                            aria-label="Quitar foto"
                                            className="absolute right-2 top-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--danger-500)] text-white shadow-md"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-3.5 text-center text-[11.5px] font-bold text-white">
                                            Foto frontal
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => frontInputRef.current?.click()}
                                        className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-control text-subtle transition-colors ${
                                            fileErrors.front
                                                ? 'border-2 border-[var(--danger-500)] bg-surface-sunken'
                                                : 'border-2 border-dashed border-default bg-surface-sunken hover:bg-surface-sunken/70'
                                        }`}
                                    >
                                        <Camera className="h-7 w-7" />
                                        <span className="text-[12.5px] font-bold text-body">Foto frontal</span>
                                        <span className="text-[10.5px]">Opcional · toca para subir</span>
                                    </button>
                                )}
                                {fileErrors.front && (
                                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--danger-600)]">{fileErrors.front}</p>
                                )}
                            </div>

                            {/* Foto de espalda o perfil */}
                            <div className="min-w-0 flex-1">
                                {backPreview ? (
                                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-control border-2 border-sport-500 bg-[var(--ink-950)]">
                                        <Image src={backPreview} alt="Espalda o perfil" fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                                        {optimizing.back && (
                                            <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                                                <Loader2 className="h-3 w-3 animate-spin" /> Optimizando…
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => clearPhoto('back', setBackPreview, setBackFile, backInputRef)}
                                            aria-label="Quitar foto"
                                            className="absolute right-2 top-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--danger-500)] text-white shadow-md"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-3.5 text-center text-[11.5px] font-bold text-white">
                                            Espalda o perfil
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => backInputRef.current?.click()}
                                        className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-control text-subtle transition-colors ${
                                            fileErrors.back
                                                ? 'border-2 border-[var(--danger-500)] bg-surface-sunken'
                                                : 'border-2 border-dashed border-default bg-surface-sunken hover:bg-surface-sunken/70'
                                        }`}
                                    >
                                        <Camera className="h-7 w-7" />
                                        <span className="text-[12.5px] font-bold text-body">Espalda o perfil</span>
                                        <span className="text-[10.5px]">Opcional · toca para subir</span>
                                    </button>
                                )}
                                {fileErrors.back && (
                                    <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--danger-600)]">{fileErrors.back}</p>
                                )}
                            </div>
                        </div>

                        <div className="mb-4 flex items-center gap-1.5 text-[11px] text-subtle">
                            <Lock className="h-3 w-3 shrink-0" />
                            <span>JPG, PNG o WEBP · máx 5 MB · privadas, solo tu coach las ve.</span>
                        </div>

                        <div className="flex gap-2.5">
                            <Button type="button" variant="secondary" size="lg" onClick={goPrev}>
                                <ChevronLeft className="h-4 w-4" /> Atrás
                            </Button>
                            <Button type="button" variant="sport" size="lg" onClick={goNext} className="flex-1">
                                Continuar <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {currentStep === 3 && (
                    <motion.div
                        key="step3"
                        custom={direction}
                        variants={stepVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        <div className="mb-2 text-[13px] font-semibold text-strong">Notas para tu coach</div>
                        <textarea
                            id="notes"
                            maxLength={1000}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onFocus={handleInputFocus}
                            placeholder="Cómo te sentiste, sueño, comentarios…"
                            className="min-h-[90px] w-full resize-y rounded-control border-[1.5px] border-default bg-surface-card p-3.5 font-ui text-[14px] text-strong outline-none transition-colors placeholder:text-muted focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]"
                        />

                        <Card padding="md" variant="sunken" className="mb-4 mt-4 gap-2.5">
                            <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Resumen</div>
                            <div className="flex justify-between">
                                {[
                                    ['Peso', `${weight} kg`],
                                    ['Energía', `${energyLevel}/10`],
                                    ['Fotos', `${photoCount} adj.`],
                                ].map(([label, value]) => (
                                    <div key={label} className="text-center">
                                        <div className="font-display text-lg font-black tabular-nums tracking-[-0.03em] text-strong">{value}</div>
                                        <div className="text-[11px] font-semibold text-muted">{label}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {state.error && (
                            <div className="mb-3 flex items-start gap-2.5 rounded-control border border-[var(--danger-500)] bg-[var(--danger-100)] px-3.5 py-3 text-[var(--danger-600)]">
                                <WifiOff className="mt-px h-[17px] w-[17px] shrink-0" />
                                <div className="flex-1">
                                    <div className="text-[13px] font-bold">No pudimos enviar tu check-in</div>
                                    <div className="mt-0.5 text-xs leading-relaxed">{humanizeStudentWriteError(state.error)}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2.5">
                            <Button type="button" variant="secondary" size="lg" disabled={isSubmitting} onClick={goPrev}>
                                <ChevronLeft className="h-4 w-4" /> Atrás
                            </Button>
                            <Button
                                type="button"
                                variant="sport"
                                size="lg"
                                onClick={() => void handleAction()}
                                disabled={isSubmitting}
                                className="flex-1"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                                    </>
                                ) : state.error ? (
                                    <>
                                        <RefreshCw className="h-4 w-4" /> Reintentar
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-4 w-4" /> Enviar check-in
                                    </>
                                )}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
