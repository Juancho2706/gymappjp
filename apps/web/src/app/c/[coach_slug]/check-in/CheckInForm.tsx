'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import {
    createCheckinUploadUrlsAction,
    submitCheckinAction,
    type CheckinState,
} from './_actions/check-in.actions'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { SuccessWaveOverlay } from '@/components/ui/SuccessWaveOverlay'

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
    const [weight, setWeight] = useState('')
    const [energyLevel, setEnergyLevel] = useState(7)
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
                    className="bg-card border border-border rounded-2xl p-8 text-center"
                >
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">¡Check-in Enviado!</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                        Tu coach ha recibido tu actualización mensual.
                    </p>
                    <button
                        type="button"
                        onClick={() => router.push(`${base}/dashboard`)}
                        className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-all text-white w-full"
                        style={{ backgroundColor: coachPrimaryColor }}
                    >
                        Volver al Inicio
                    </button>
                </motion.div>
            </>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-center gap-2 mb-2">
                {[1, 2, 3].map((step) => (
                    <motion.div
                        key={step}
                        animate={{
                            width: currentStep === step ? 24 : 8,
                            backgroundColor:
                                currentStep >= step ? coachPrimaryColor : 'hsl(var(--muted))',
                        }}
                        className="h-2 rounded-full"
                        transition={reducedMotion ? { duration: 0 } : springs.snappy}
                    />
                ))}
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 overflow-hidden relative min-h-[320px]">
                <AnimatePresence mode="wait" custom={direction}>
                    {currentStep === 1 && (
                        <motion.div
                            key="step1"
                            custom={direction}
                            variants={stepVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="space-y-4"
                        >
                            {lastCheckIn ? (
                                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm mb-4">
                                    <p className="text-xs text-muted-foreground">Tu último check-in</p>
                                    <p className="font-bold">
                                        {lastCheckIn.weight != null ? `${lastCheckIn.weight} kg` : '—'} · Energía{' '}
                                        {lastCheckIn.energy_level ?? '—'}/10
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatRelativeDate(lastCheckIn.created_at.slice(0, 10))}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground mb-4">
                                    <p className="font-medium text-foreground">Tu primer check-in</p>
                                    <p className="mt-1 text-xs leading-relaxed">
                                        Registra peso y energía; las fotos ayudan a tu coach a ver el progreso.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label
                                    className="block text-sm font-medium text-muted-foreground mb-1.5"
                                    htmlFor="weight"
                                >
                                    Peso actual (kg)
                                </label>
                                <input
                                    id="weight"
                                    type="text"
                                    inputMode="decimal"
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
                                    onFocus={handleInputFocus}
                                    placeholder="75.5"
                                    className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    className="block text-sm font-medium text-muted-foreground mb-1.5"
                                    htmlFor="energy_level"
                                >
                                    Nivel de energía (1–10)
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        id="energy_level"
                                        type="range"
                                        min={1}
                                        max={10}
                                        value={energyLevel}
                                        onChange={(e) => setEnergyLevel(Number(e.target.value))}
                                        className="flex-1"
                                        style={{ accentColor: coachPrimaryColor }}
                                    />
                                    <span className="w-6 text-center text-lg font-bold text-foreground">
                                        {energyLevel}
                                    </span>
                                </div>
                            </div>
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
                            className="space-y-5"
                        >
                            <p className="text-sm text-muted-foreground">
                                Las fotos son opcionales pero ayudan a tu coach a ver tu evolución.
                            </p>

                            <input
                                ref={frontInputRef}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) =>
                                    validateAndSetFile(
                                        e.target.files?.[0],
                                        'front',
                                        setFrontPreview,
                                        setFrontFile
                                    )
                                }
                            />
                            <input
                                ref={backInputRef}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) =>
                                    validateAndSetFile(
                                        e.target.files?.[0],
                                        'back',
                                        setBackPreview,
                                        setBackFile
                                    )
                                }
                            />

                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">
                                    Foto frontal <span className="text-xs font-normal">— Opcional</span>
                                </p>
                                {frontPreview ? (
                                    <div className="relative w-full aspect-[3/4] max-h-72 rounded-xl overflow-hidden border border-border">
                                        <Image src={frontPreview} alt="Frontal" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                                        {optimizing.front && (
                                            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Optimizando…
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => clearPhoto('front', setFrontPreview, setFrontFile, frontInputRef)}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => frontInputRef.current?.click()}
                                        className={`w-full flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-xl ${
                                            fileErrors.front
                                                ? 'border-red-500/50 bg-red-500/5'
                                                : 'border-border hover:bg-secondary/50'
                                        }`}
                                    >
                                        <Camera className="w-8 h-8 mb-2 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">
                                            {fileErrors.front || 'Seleccionar foto frontal'}
                                        </span>
                                    </button>
                                )}
                            </div>

                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-2">
                                    Foto de espalda o perfil <span className="text-xs font-normal">— Opcional</span>
                                </p>
                                {backPreview ? (
                                    <div className="relative w-full aspect-[3/4] max-h-72 rounded-xl overflow-hidden border border-border">
                                        <Image src={backPreview} alt="Espalda" fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                                        {optimizing.back && (
                                            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Optimizando…
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => clearPhoto('back', setBackPreview, setBackFile, backInputRef)}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => backInputRef.current?.click()}
                                        className={`w-full flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-xl ${
                                            fileErrors.back
                                                ? 'border-red-500/50 bg-red-500/5'
                                                : 'border-border hover:bg-secondary/50'
                                        }`}
                                    >
                                        <Camera className="w-8 h-8 mb-2 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">
                                            {fileErrors.back || 'Seleccionar foto'}
                                        </span>
                                    </button>
                                )}
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
                            className="space-y-4"
                        >
                            <div>
                                <label
                                    className="block text-sm font-medium text-muted-foreground mb-1.5"
                                    htmlFor="notes"
                                >
                                    Notas <span className="text-xs font-normal">— Opcional (máx. 1000)</span>
                                </label>
                                <textarea
                                    id="notes"
                                    rows={4}
                                    maxLength={1000}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onFocus={handleInputFocus}
                                    placeholder="Cómo te sentiste, sueño, comentarios para tu coach…"
                                    className="w-full p-3.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                />
                            </div>
                            <div className="rounded-xl border border-border p-3 text-sm space-y-1 mb-4">
                                <p>
                                    Peso: <strong>{weight || '—'} kg</strong>
                                </p>
                                <p>
                                    Energía: <strong>{energyLevel}/10</strong>
                                </p>
                                <p>
                                    Fotos:{' '}
                                    <strong>{[frontFile, backFile].filter(Boolean).length} adjuntas</strong>
                                </p>
                            </div>
                            {state.error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                                    {state.error}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex gap-3 mt-6">
                    {currentStep > 1 && (
                        <button
                            type="button"
                            onClick={goPrev}
                            className="flex-1 h-11 rounded-xl border border-border font-semibold flex items-center justify-center gap-1.5"
                        >
                            <ChevronLeft className="w-4 h-4" /> Atrás
                        </button>
                    )}
                    {currentStep < 3 ? (
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={currentStep === 1 && !weight}
                            className="flex-1 h-11 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                            style={{ backgroundColor: coachPrimaryColor }}
                        >
                            Continuar <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void handleAction()}
                            disabled={isSubmitting}
                            className="flex-1 h-11 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                            style={{ backgroundColor: coachPrimaryColor }}
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Enviar Check-in'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
