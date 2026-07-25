'use client'

import { useActionState, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { submitIntakeForm } from './_actions/onboarding.actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Check, Scale, Ruler, Bandage, HeartPulse } from 'lucide-react'

interface Props {
    coachSlug: string
}

/** Chip group tappable (espejo del kit flow.jsx › AccesoEstados `Pick`). Seleccionado = sólido. */
function Pick({
    label,
    value,
    onPick,
    options,
}: {
    label: string
    value: string
    onPick: (v: string) => void
    options: { value: string; label: string }[]
}) {
    return (
        <div className="space-y-2">
            <div className="text-[13px] font-semibold text-text-strong">{label}</div>
            <div className="flex flex-wrap gap-2">
                {options.map((o) => {
                    const active = value === o.value
                    return (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => onPick(o.value)}
                            aria-pressed={active}
                            className="min-h-[38px] rounded-control border-[1.5px] px-3.5 text-[13.5px] font-semibold transition-colors"
                            style={
                                active
                                    ? { background: 'var(--ink-950)', color: '#fff', borderColor: 'var(--ink-950)' }
                                    : { background: 'var(--surface-card)', color: 'var(--text-body)', borderColor: 'var(--border-default)' }
                            }
                        >
                            {o.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

const STORAGE_KEY = 'onboarding_draft'

export function OnboardingForm({ coachSlug }: Props) {
    const bindedSubmit = submitIntakeForm.bind(null, coachSlug)
    const [state, action, isPending] = useActionState(bindedSubmit, {})
    
    const [currentStep, setCurrentStep] = useState(1)
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        goals: '',
        experience_level: '',
        availability: '',
        injuries: '',
        medical_conditions: ''
    })
    const [ageConfirmed, setAgeConfirmed] = useState(false)
    const [ageError, setAgeError] = useState(false)
    const [touched, setTouched] = useState<Record<string, boolean>>({})

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem(`${STORAGE_KEY}_${coachSlug}`)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                setFormData(parsed.formData)
                setCurrentStep(parsed.currentStep)
            } catch (e) {
                console.error('Error loading onboarding draft', e)
            }
        }
    }, [coachSlug])

    // Save to localStorage whenever formData or currentStep changes
    useEffect(() => {
        localStorage.setItem(`${STORAGE_KEY}_${coachSlug}`, JSON.stringify({
            formData,
            currentStep
        }))
    }, [formData, currentStep, coachSlug])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        // Clear error once user starts typing/selecting
        if (touched[name]) setTouched(prev => ({ ...prev, [name]: true }))
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setTouched(prev => ({ ...prev, [e.target.name]: true }))
    }

    // Selección por chip (Metas): actualiza formData + marca touched para limpiar el error inline.
    const handlePick = (name: 'goals' | 'experience_level' | 'availability') => (value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }))
        setTouched(prev => ({ ...prev, [name]: true }))
    }

    const fieldError = (name: string): string | null => {
        if (!touched[name]) return null
        if (formData[name as keyof typeof formData] === '') return 'Este campo es requerido'
        if ((name === 'weight' || name === 'height') && Number(formData[name as keyof typeof formData]) <= 0) {
            return 'Ingresa un valor válido'
        }
        return null
    }

    const STEP_REQUIRED_FIELDS: Record<number, string[]> = {
        1: ['weight', 'height'],
        2: ['goals', 'experience_level', 'availability'],
        3: [],
    }

    const nextStep = () => {
        if (validateCurrentStep()) {
            setCurrentStep(prev => Math.min(prev + 1, 3))
        } else {
            // Mark all required fields of current step as touched to show errors
            const fields = STEP_REQUIRED_FIELDS[currentStep] ?? []
            setTouched(prev => ({ ...prev, ...Object.fromEntries(fields.map(f => [f, true])) }))
        }
    }

    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1))

    const validateCurrentStep = () => {
        if (currentStep === 1) {
            return formData.weight !== '' && formData.height !== ''
        }
        if (currentStep === 2) {
            return formData.goals !== '' && formData.experience_level !== '' && formData.availability !== ''
        }
        if (currentStep === 3) {
            if (!ageConfirmed) { setAgeError(true); return false }
        }
        return true
    }

    const clearDraft = useCallback(() => {
        localStorage.removeItem(`${STORAGE_KEY}_${coachSlug}`)
    }, [coachSlug])

    // Clear draft on successful submission
    useEffect(() => {
        if (state.success) {
            clearDraft()
        }
    }, [state.success, clearDraft])

    const stepVariants = {
        hidden: { x: 20, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.3 } },
        exit: { x: -20, opacity: 0, transition: { duration: 0.2 } }
    }

    return (
        <div className="space-y-8 overflow-hidden">
            {/* Progreso — barras segmentadas + eyebrow "Paso X de 3" (kit flow.jsx › onboarding). */}
            <div className="pt-4 px-1">
                <div className="flex gap-1.5">
                    {[1, 2, 3].map((step) => (
                        <div key={step} className="h-[5px] flex-1 overflow-hidden rounded-pill bg-[var(--sport-100)]">
                            <motion.div
                                className="h-full rounded-pill bg-[var(--sport-500)]"
                                initial={false}
                                animate={{ width: currentStep >= step ? '100%' : '0%' }}
                                transition={{ duration: 0.4, ease: 'easeInOut' }}
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                    Paso {currentStep} de 3
                </div>
            </div>

            <form action={action} className="min-h-[400px] flex flex-col relative">
                <AnimatePresence mode="wait" initial={false}>
                    {currentStep === 1 && (
                        <motion.div
                            key="step1"
                            variants={stepVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="space-y-6"
                        >
                            <div className="space-y-1">
                                <h2 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">Tus datos</h2>
                                <p className="text-sm text-muted-foreground">Empecemos con lo básico para personalizar tu plan.</p>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="weight" className="text-muted-foreground">Peso actual (kg)*</Label>
                                    <div className="relative">
                                        <Scale className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                        <Input
                                            id="weight"
                                            name="weight"
                                            type="number"
                                            step="0.1"
                                            placeholder="Ej. 75.5"
                                            required
                                            value={formData.weight}
                                            onChange={handleInputChange}
                                            onBlur={handleBlur}
                                            className={`pl-10 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)] ${fieldError('weight') ? 'border-[var(--danger-500)] focus-visible:border-[var(--danger-500)]' : ''}`}
                                        />
                                    </div>
                                    {fieldError('weight') && <p className="text-xs text-[var(--danger-600)]">{fieldError('weight')}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="height" className="text-muted-foreground">Estatura (cm)*</Label>
                                    <div className="relative">
                                        <Ruler className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                        <Input
                                            id="height"
                                            name="height"
                                            type="number"
                                            placeholder="Ej. 178"
                                            required
                                            value={formData.height}
                                            onChange={handleInputChange}
                                            onBlur={handleBlur}
                                            className={`pl-10 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)] ${fieldError('height') ? 'border-[var(--danger-500)] focus-visible:border-[var(--danger-500)]' : ''}`}
                                        />
                                    </div>
                                    {fieldError('height') && <p className="text-xs text-[var(--danger-600)]">{fieldError('height')}</p>}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {currentStep === 2 && (
                        <motion.div
                            key="step2"
                            variants={stepVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="space-y-6"
                        >
                            <div className="space-y-1">
                                <h2 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">Tus metas</h2>
                                <p className="text-sm text-muted-foreground">¿Qué quieres lograr y cuánto tiempo tienes?</p>
                            </div>

                            <div className="space-y-1">
                                <Pick
                                    label="¿Cuál es tu objetivo principal?*"
                                    value={formData.goals}
                                    onPick={handlePick('goals')}
                                    options={[
                                        { value: 'Perder grasa', label: 'Perder grasa' },
                                        { value: 'Aumentar masa muscular', label: 'Masa muscular' },
                                        { value: 'Recomposición corporal', label: 'Recomposición' },
                                        { value: 'Mantenimiento general', label: 'Mantenimiento' },
                                        { value: 'Rendimiento deportivo', label: 'Rendimiento' },
                                    ]}
                                />
                                {fieldError('goals') && <p className="text-xs text-[var(--danger-600)] pt-1">{fieldError('goals')}</p>}
                            </div>

                            <div className="space-y-1">
                                <Pick
                                    label="Experiencia*"
                                    value={formData.experience_level}
                                    onPick={handlePick('experience_level')}
                                    options={[
                                        { value: 'Principiante', label: 'Principiante' },
                                        { value: 'Intermedio', label: 'Intermedio' },
                                        { value: 'Avanzado', label: 'Avanzado' },
                                    ]}
                                />
                                {fieldError('experience_level') && <p className="text-xs text-[var(--danger-600)] pt-1">{fieldError('experience_level')}</p>}
                            </div>

                            <div className="space-y-1">
                                <Pick
                                    label="Días por semana*"
                                    value={formData.availability}
                                    onPick={handlePick('availability')}
                                    options={[
                                        { value: '2 días', label: '2' },
                                        { value: '3 días', label: '3' },
                                        { value: '4 días', label: '4' },
                                        { value: '5 días', label: '5' },
                                        { value: '6+ días', label: '6+' },
                                    ]}
                                />
                                {fieldError('availability') && <p className="text-xs text-[var(--danger-600)] pt-1">{fieldError('availability')}</p>}
                            </div>
                        </motion.div>
                    )}

                    {currentStep === 3 && (
                        <motion.div
                            key="step3"
                            variants={stepVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="space-y-6"
                        >
                            <div className="space-y-1">
                                <h2 className="font-display text-2xl font-black tracking-[-0.02em] text-text-strong">Salud y seguridad</h2>
                                <p className="text-sm text-muted-foreground">Esta información es vital para evitar lesiones.</p>
                            </div>
                            <div className="rounded-control border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-3 py-2 text-xs text-[var(--warning-700)]">
                                EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="injuries" className="text-muted-foreground">Lesiones o limitaciones</Label>
                                <div className="relative">
                                    <Bandage className="absolute left-3.5 top-3 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                    <textarea
                                        id="injuries"
                                        name="injuries"
                                        rows={2}
                                        placeholder="Ej. Dolor en rodilla derecha al correr..."
                                        value={formData.injuries}
                                        onChange={handleInputChange}
                                        className="flex w-full rounded-control border-[1.5px] border-border-default bg-surface-card pl-10 pr-3.5 py-2.5 text-[15px] text-text-strong outline-none transition-all focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)] placeholder:text-text-muted"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="medical_conditions" className="text-muted-foreground">Condiciones médicas</Label>
                                <div className="relative">
                                    <HeartPulse className="absolute left-3.5 top-3 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                    <textarea
                                        id="medical_conditions"
                                        name="medical_conditions"
                                        rows={2}
                                        placeholder="Ej. Hipertensión, asma, diabetes..."
                                        value={formData.medical_conditions}
                                        onChange={handleInputChange}
                                        className="flex w-full rounded-control border-[1.5px] border-border-default bg-surface-card pl-10 pr-3.5 py-2.5 text-[15px] text-text-strong outline-none transition-all focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)] placeholder:text-text-muted"
                                    />
                                </div>
                            </div>

                            {/* Hidden fields for server submission in step 3 if needed, 
                                but since we are submitting the whole form at once, 
                                they should all be in the DOM but maybe hidden?
                                Actually, in React 19 useActionState, the form action takes the FormData.
                                If the inputs are not in the DOM, they won't be in the FormData.
                                So we need to keep them all in the DOM but hidden, OR 
                                handle the submission manually.
                                
                                Wait, if I use `AnimatePresence` and conditional rendering, 
                                the fields not in the current step are NOT in the DOM.
                                So `formData` in `submitIntakeForm` will only have the fields of the last step.
                                
                                Fix: Use hidden inputs for all fields in the final step.
                            */}
                            <div className="space-y-1">
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="age_confirmed"
                                        checked={ageConfirmed}
                                        onChange={e => { setAgeConfirmed(e.target.checked); setAgeError(false) }}
                                        className="mt-0.5 h-4 w-4 rounded border-border-default accent-[var(--theme-primary)] cursor-pointer flex-shrink-0"
                                    />
                                    <span className="text-xs text-muted-foreground leading-snug">
                                        Confirmo que tengo 14 años o más y acepto los{' '}
                                        <a href="/legal" target="_blank" className="underline hover:text-foreground">términos de uso</a>
                                        {' '}y la{' '}
                                        <a href="/privacidad" target="_blank" className="underline hover:text-foreground">política de privacidad</a>.*
                                    </span>
                                </label>
                                {ageError && <p className="text-xs text-[var(--danger-600)] pl-6">Debes confirmar tu edad para continuar.</p>}
                            </div>

                            <input type="hidden" name="weight" value={formData.weight} />
                            <input type="hidden" name="height" value={formData.height} />
                            <input type="hidden" name="goals" value={formData.goals} />
                            <input type="hidden" name="experience_level" value={formData.experience_level} />
                            <input type="hidden" name="availability" value={formData.availability} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {state.error && (
                    <div className="mt-4 p-3 text-sm font-semibold text-[var(--danger-600)] bg-[var(--danger-100)] border border-transparent rounded-control">
                        {state.error}
                    </div>
                )}

                <div className="mt-auto pt-8 flex gap-3">
                    {currentStep > 1 && (
                        <Button 
                            type="button"
                            variant="outline"
                            onClick={prevStep}
                            className="flex-1 h-12 border-border text-foreground hover:bg-accent"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            Atrás
                        </Button>
                    )}
                    
                    {currentStep < 3 ? (
                        <Button
                            type="button"
                            onClick={nextStep}
                            className="flex-1 h-12 text-white bg-[var(--theme-primary)] hover:opacity-90 ml-auto"
                        >
                            Siguiente
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            disabled={isPending}
                            onClick={e => { if (!ageConfirmed) { e.preventDefault(); setAgeError(true) } }}
                            className="flex-1 h-12 text-white bg-[var(--theme-primary)] hover:opacity-90"
                        >
                            {isPending ? 'Guardando...' : 'Finalizar registro'}
                            <Check className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </form>
        </div>
    )
}
