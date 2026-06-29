'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Lock, X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { submitCheckinAction, type CheckinState } from './_actions/check-in.actions'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { SuccessWaveOverlay } from '@/components/ui/SuccessWaveOverlay'
import { Button } from '@/components/ui/button'

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

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

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

    useEffect(() => {
        if (state.error != null || state.success) {
            setIsSubmitting(false)
        }
    }, [state.error, state.success])

    useEffect(() => {
        if (state.success) {
            toast.success('Check-in enviado', { id: 'client-checkin-ok' })
            // Delight: brand-themed wave overlay + confetti burst on a successful check-in.
            setShowCelebration(true)
            if (!reducedMotion) {
                void fireConfetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.5, y: 0.7 } })
            }
        }
        if (state.error) {
            toast.error(state.error, { id: 'client-checkin-err' })
        }
    }, [state.success, state.error, reducedMotion])

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

    function validateAndSetFile(
        file: File | undefined,
        side: 'front' | 'back',
        setPreview: (u: string | null) => void,
        setFile: (f: File | null) => void
    ) {
        setFileErrors((e) => ({ ...e, [side]: undefined }))
        if (!file) return
        if (!ALLOWED_TYPES.includes(file.type)) {
            setFileErrors((e) => ({
                ...e,
                [side]: 'Formato no permitido. Solo JPG, PNG o WEBP.',
            }))
            return
        }
        if (file.size > MAX_SIZE) {
            setFileErrors((e) => ({ ...e, [side]: 'La imagen pesa más de 5MB.' }))
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
            if (frontFile) {
                const compressed = await imageCompression(frontFile, {
                    maxSizeMB: 2,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                })
                formData.set('photo', compressed, frontFile.name)
            }
            if (backFile) {
                const compressed = await imageCompression(backFile, {
                    maxSizeMB: 2,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                })
                formData.set('back_photo', compressed, backFile.name)
            }
            startTransition(() => formAction(formData))
        } catch {
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
                    className="rounded-card border border-subtle bg-surface-card p-8 text-center shadow-sm"
                >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-500)] text-white shadow-[0_8px_28px_rgba(31,184,119,0.4)]">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h3 className="mb-2 font-display text-xl font-extrabold tracking-tight text-strong">¡Check-in Enviado!</h3>
                    <p className="mb-6 text-sm text-muted">
                        Tu coach ha recibido tu actualización mensual.
                    </p>
                    <Button
                        type="button"
                        variant="sport"
                        size="lg"
                        onClick={() => router.push(`${base}/dashboard`)}
                        className="w-full"
                    >
                        Volver al Inicio
                    </Button>
                </motion.div>
            </>
        )
    }

    return (
        <div className="space-y-6">
            <div className="mb-2 flex items-center justify-center gap-2">
                {[1, 2, 3].map((step) => (
                    <motion.div
                        key={step}
                        animate={{
                            width: currentStep === step ? 26 : 8,
                            backgroundColor:
                                currentStep >= step ? coachPrimaryColor : 'var(--ink-200)',
                        }}
                        className="h-1.5 rounded-full"
                        transition={reducedMotion ? { duration: 0 } : springs.snappy}
                    />
                ))}
            </div>

            <div className="relative min-h-[320px] overflow-hidden rounded-card border border-subtle bg-surface-card p-6 shadow-sm">
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
                                <div className="mb-4 rounded-control bg-surface-sunken p-3 text-sm">
                                    <p className="text-xs font-bold text-muted">Tu último check-in</p>
                                    <p className="font-semibold text-strong">
                                        {lastCheckIn.weight != null ? `${lastCheckIn.weight} kg` : '—'} · Energía{' '}
                                        {lastCheckIn.energy_level ?? '—'}/10
                                    </p>
                                    <p className="text-xs text-muted">
                                        {formatRelativeDate(lastCheckIn.created_at.slice(0, 10))}
                                    </p>
                                </div>
                            ) : (
                                <div className="mb-4 rounded-control border border-dashed border-default bg-surface-sunken p-4 text-sm text-muted">
                                    <p className="font-semibold text-strong">Tu primer check-in</p>
                                    <p className="mt-1 text-xs leading-relaxed">
                                        Registra peso y energía; las fotos ayudan a tu coach a ver el progreso.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label
                                    className="mb-1.5 block text-[13px] font-semibold text-strong"
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
                                    className="h-12 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 font-ui text-[15px] font-medium text-strong outline-none transition-colors placeholder:text-muted focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]"
                                />
                            </div>
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label
                                        className="text-[13px] font-semibold text-strong"
                                        htmlFor="energy_level"
                                    >
                                        Nivel de energía (1–10)
                                    </label>
                                    <span className="font-display text-base font-extrabold tabular-nums text-sport-600">
                                        {energyLevel}<span className="text-xs font-semibold text-muted">/10</span>
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
                            className="space-y-4"
                        >
                            <p className="text-sm text-muted">
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

                            <div className="flex items-start gap-3">
                                {/* Foto frontal */}
                                <div className="min-w-0 flex-1">
                                    {frontPreview ? (
                                        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-control border-2 border-sport-500">
                                            <Image src={frontPreview} alt="Frontal" fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFrontPreview(null)
                                                    setFrontFile(null)
                                                    if (frontInputRef.current) frontInputRef.current.value = ''
                                                }}
                                                aria-label="Quitar foto"
                                                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--danger-500)] text-white shadow-md"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-3.5 text-center text-[11.5px] font-bold text-white">
                                                Foto frontal
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => frontInputRef.current?.click()}
                                            className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-control transition-colors ${
                                                fileErrors.front
                                                    ? 'border-2 border-[var(--danger-500)] bg-[var(--danger-100)]'
                                                    : 'border-2 border-dashed border-default bg-surface-sunken hover:bg-surface-sunken/70'
                                            }`}
                                        >
                                            <Camera className="h-7 w-7 text-subtle" />
                                            <span className="text-[12.5px] font-bold text-body">Foto frontal</span>
                                            <span className="text-[10.5px] text-subtle">Opcional · toca para subir</span>
                                        </button>
                                    )}
                                    {fileErrors.front && (
                                        <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--danger-600)]">{fileErrors.front}</p>
                                    )}
                                </div>

                                {/* Foto de espalda o perfil */}
                                <div className="min-w-0 flex-1">
                                    {backPreview ? (
                                        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-control border-2 border-sport-500">
                                            <Image src={backPreview} alt="Espalda" fill sizes="(max-width: 768px) 50vw, 200px" className="object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setBackPreview(null)
                                                    setBackFile(null)
                                                    if (backInputRef.current) backInputRef.current.value = ''
                                                }}
                                                aria-label="Quitar foto"
                                                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--danger-500)] text-white shadow-md"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-3.5 text-center text-[11.5px] font-bold text-white">
                                                Espalda o perfil
                                            </span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => backInputRef.current?.click()}
                                            className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-control transition-colors ${
                                                fileErrors.back
                                                    ? 'border-2 border-[var(--danger-500)] bg-[var(--danger-100)]'
                                                    : 'border-2 border-dashed border-default bg-surface-sunken hover:bg-surface-sunken/70'
                                            }`}
                                        >
                                            <Camera className="h-7 w-7 text-subtle" />
                                            <span className="text-[12.5px] font-bold text-body">Espalda o perfil</span>
                                            <span className="text-[10.5px] text-subtle">Opcional · toca para subir</span>
                                        </button>
                                    )}
                                    {fileErrors.back && (
                                        <p className="mt-1.5 text-[11px] font-semibold leading-tight text-[var(--danger-600)]">{fileErrors.back}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                                <Lock className="h-3 w-3 shrink-0" />
                                <span>JPG, PNG o WEBP · máx 5 MB · privadas, solo tu coach las ve.</span>
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
                                    className="mb-1.5 block text-[13px] font-semibold text-strong"
                                    htmlFor="notes"
                                >
                                    Notas <span className="text-xs font-normal text-muted">— Opcional (máx. 1000)</span>
                                </label>
                                <textarea
                                    id="notes"
                                    rows={4}
                                    maxLength={1000}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onFocus={handleInputFocus}
                                    placeholder="Cómo te sentiste, sueño, comentarios para tu coach…"
                                    className="w-full resize-none rounded-control border-[1.5px] border-default bg-surface-card p-3.5 font-ui text-[15px] text-strong outline-none transition-colors placeholder:text-muted focus-visible:border-sport-600 focus-visible:shadow-[var(--ring-focus)]"
                                />
                            </div>
                            <div className="mb-4 rounded-control bg-surface-sunken p-4">
                                <p className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Resumen</p>
                                <div className="flex justify-between">
                                    {[
                                        ['Peso', `${weight || '—'} kg`],
                                        ['Energía', `${energyLevel}/10`],
                                        ['Fotos', `${[frontFile, backFile].filter(Boolean).length} adj.`],
                                    ].map(([label, value]) => (
                                        <div key={label} className="text-center">
                                            <div className="font-display text-lg font-extrabold tabular-nums text-strong">{value}</div>
                                            <div className="text-[11px] font-semibold text-muted">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {state.error && (
                                <div className="rounded-control border border-[var(--danger-500)] bg-[var(--danger-100)] p-3 text-sm text-[var(--danger-600)]">
                                    {state.error}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-6 flex gap-3">
                    {currentStep > 1 && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="lg"
                            onClick={goPrev}
                            className="flex-1"
                        >
                            <ChevronLeft className="h-4 w-4" /> Atrás
                        </Button>
                    )}
                    {currentStep < 3 ? (
                        <Button
                            type="button"
                            variant="sport"
                            size="lg"
                            onClick={goNext}
                            disabled={currentStep === 1 && !weight}
                            className="flex-1"
                        >
                            Continuar <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="sport"
                            size="lg"
                            onClick={() => void handleAction()}
                            disabled={isSubmitting}
                            className="flex-1"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Check className="h-4 w-4" /> Enviar Check-in
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
