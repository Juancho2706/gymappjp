'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    ArrowRight,
    Camera,
    Check,
    CheckCircle2,
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
import { submitCheckinAction, type CheckinState } from './_actions/check-in.actions'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
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
    coachPrimaryColor: string
    lastCheckIn: LastCheckInRow
}

// 12MB: una foto de cámara moderna (HEIC/JPEG 12-48MP) pesa 3-8MB ANTES de comprimir; el gate
// del bucket (5MB) aplica solo al fallback sin comprimir — la conversión a JPEG de handleAction
// deja ~2MB. Rechazar acá al ELEGIR = el alumno nunca puede adjuntar (incidente jul-2026).
const MAX_SIZE = 12 * 1024 * 1024

export function CheckInForm({ coachSlug, coachPrimaryColor, lastCheckIn }: Props) {
    const router = useRouter()
    const base = useBasePath(`/c/${coachSlug}`)
    const reducedMotion = useReducedMotion()
    const [state, formAction] = useActionState(submitCheckinAction, initialState)

    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
    const [direction, setDirection] = useState<1 | -1>(1)
    const [weight, setWeight] = useState(() =>
        lastCheckIn?.weight != null ? lastCheckIn.weight.toFixed(1) : '70.0'
    )
    const [energyLevel, setEnergyLevel] = useState(lastCheckIn?.energy_level ?? 7)
    const [notes, setNotes] = useState('')
    const [frontFile, setFrontFile] = useState<File | null>(null)
    const [backFile, setBackFile] = useState<File | null>(null)
    const [frontPreview, setFrontPreview] = useState<string | null>(null)
    const [backPreview, setBackPreview] = useState<string | null>(null)
    const [fileErrors, setFileErrors] = useState<{ front?: string; back?: string }>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showCelebration, setShowCelebration] = useState(false)

    useEffect(() => {
        if (state.error != null || state.success) {
            setIsSubmitting(false)
        }
    }, [state.error, state.success])

    useEffect(() => {
        if (state.success) {
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
            toast.error(state.error, { id: 'client-checkin-err' })
        }
    }, [state.success, state.error, state.warning, reducedMotion])

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
        setDirection(1)
        setCurrentStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))
    }
    const goPrev = () => {
        setDirection(-1)
        setCurrentStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))
    }

    const adjustWeight = (delta: number) =>
        setWeight((w) => Math.max(0, (parseFloat(w) || 0) + delta).toFixed(1))

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
        // reportan mime) DEBEN pasar — handleAction los normaliza a JPEG y el server decide por
        // bytes (sharp). El allowlist estricto acá era el bloqueo real del incidente jul-2026:
        // rechazaba la foto ANTES de que la conversión a JPEG pudiera correr.
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
            // Compresión BEST-EFFORT: normaliza a JPEG (encode universal, incl. iOS viejos) — esto
            // CONVIERTE las fotos HEIC de iPhone, que el bucket rechaza y hacían fallar el check-in
            // ENTERO. El server igual las re-comprime a WebP para el storage. NUNCA bloquea: si la
            // conversión falla O SE CUELGA (incidente 2026-07-02: con ciertas fotos la promesa de
            // browser-image-compression jamás resuelve → spinner infinito, el POST nunca salía),
            // seguimos sin ella a los 15s. useWebWorker=false (hilo principal): el worker podía
            // fallar y dejaba el check-in bloqueado en silencio.
            const compressForUpload = async (file: File): Promise<File | Blob | null> => {
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
                    console.warn('[checkin] compresión client colgada (timeout 15s), intentando original')
                } catch (err) {
                    console.warn('[checkin] compresión client falló, intentando original:', err)
                }
                // Fallback al ORIGINAL — salvo que pese tanto que rompería el bodySizeLimit (10MB)
                // del server action con las dos fotos: ahí es mejor soltar la foto que colgar o
                // reventar el submit entero. El check-in SIEMPRE sale.
                if (file.size > 4.5 * 1024 * 1024) {
                    console.warn('[checkin] original muy pesado tras fallo de compresión, foto descartada')
                    return null
                }
                return file
            }
            let fotosDescartadas = 0
            if (frontFile) {
                const body = await compressForUpload(frontFile)
                if (body) formData.set('photo', body, frontFile.name)
                else fotosDescartadas++
            }
            if (backFile) {
                const body = await compressForUpload(backFile)
                if (body) formData.set('back_photo', body, backFile.name)
                else fotosDescartadas++
            }
            if (fotosDescartadas > 0) {
                toast.warning(
                    fotosDescartadas === 1
                        ? 'Una foto no pudo procesarse y va a omitirse; tu check-in se envía igual.'
                        : 'Las fotos no pudieron procesarse y van a omitirse; tu check-in se envía igual.',
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
                        <CheckCircle2 className="h-11 w-11" />
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
                                    <span className="font-display text-5xl font-black tabular-nums text-strong">
                                        {weight}
                                    </span>
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
                        </Card>

                        {/* Nivel de energía */}
                        <Card padding="lg" className="mb-4 gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] font-semibold text-strong">Nivel de energía</span>
                                <span className="font-display text-base font-black tabular-nums text-sport-600">
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
                            disabled={!weight}
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
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFrontPreview(null)
                                                setFrontFile(null)
                                                if (frontInputRef.current) frontInputRef.current.value = ''
                                            }}
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
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBackPreview(null)
                                                setBackFile(null)
                                                if (backInputRef.current) backInputRef.current.value = ''
                                            }}
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
                                        <div className="font-display text-lg font-black tabular-nums text-strong">{value}</div>
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
                                    <div className="mt-0.5 text-xs leading-relaxed">{state.error}</div>
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
