'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { submitCheckinAction, type CheckinState } from './actions'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'

const initialState: CheckinState = {}

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

    useEffect(() => {
        if (state.error != null || state.success) {
            setIsSubmitting(false)
        }
    }, [state.error, state.success])

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
            formAction(formData)
        } catch {
            setIsSubmitting(false)
        }
    }

    if (state.success) {
        return (
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
                    onClick={() => router.push(`/c/${coachSlug}/dashboard`)}
                    className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-all text-white w-full"
                    style={{ backgroundColor: coachPrimaryColor }}
                >
                    Volver al Inicio
                </button>
            </motion.div>
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
                            {lastCheckIn && (
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
                                    type="number"
                                    step="0.1"
                                    min={20}
                                    max={400}
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value)}
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
                                        <Image src={frontPreview} alt="Frontal" fill className="object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFrontPreview(null)
                                                setFrontFile(null)
                                                if (frontInputRef.current) frontInputRef.current.value = ''
                                            }}
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
                                        <Image src={backPreview} alt="Espalda" fill className="object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBackPreview(null)
                                                setBackFile(null)
                                                if (backInputRef.current) backInputRef.current.value = ''
                                            }}
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
