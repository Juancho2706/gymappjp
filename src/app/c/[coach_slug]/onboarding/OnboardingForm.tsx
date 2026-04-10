'use client'

import { useActionState, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { submitIntakeForm } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'

interface Props {
    coachSlug: string
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
    }

    const nextStep = () => {
        if (validateCurrentStep()) {
            setCurrentStep(prev => Math.min(prev + 1, 3))
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
            {/* Progress Bar */}
            <div className="relative pt-4 px-2">
                <div className="flex justify-between mb-2">
                    {[1, 2, 3].map((step) => (
                        <div key={step} className="flex flex-col items-center relative z-10">
                            <motion.div 
                                initial={false}
                                animate={{
                                    backgroundColor: currentStep >= step ? 'var(--theme-primary)' : 'hsl(var(--muted))',
                                    color: currentStep >= step ? '#ffffff' : 'hsl(var(--muted-foreground))',
                                    scale: currentStep === step ? 1.1 : 1
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300`}
                            >
                                {currentStep > step ? <Check className="w-5 h-5" /> : step}
                            </motion.div>
                            <span className={`text-[10px] mt-1.5 uppercase tracking-wider font-semibold transition-colors duration-300 ${
                                currentStep >= step ? 'text-foreground' : 'text-muted-foreground/60'
                            }`}>
                                {step === 1 ? 'Bio' : step === 2 ? 'Metas' : 'Salud'}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="absolute top-[32px] left-8 right-8 h-[2px] bg-muted -z-0">
                    <motion.div 
                        className="h-full bg-[var(--theme-primary)]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${(currentStep - 1) * 50}%` }}
                        transition={{ duration: 0.4, ease: 'easeInOut' }}
                    />
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
                                <h2 className="text-xl font-bold text-foreground">Tus datos biométricos</h2>
                                <p className="text-sm text-muted-foreground">Empecemos con lo básico para personalizar tu plan.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="weight" className="text-muted-foreground">Peso actual (kg)*</Label>
                                    <Input 
                                        id="weight" 
                                        name="weight" 
                                        type="number" 
                                        step="0.1" 
                                        placeholder="Ej. 75.5" 
                                        required 
                                        value={formData.weight}
                                        onChange={handleInputChange}
                                        className="bg-background/50 border-border text-foreground focus:border-[var(--theme-primary)]"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="height" className="text-muted-foreground">Estatura (cm)*</Label>
                                    <Input 
                                        id="height" 
                                        name="height" 
                                        type="number" 
                                        placeholder="Ej. 178" 
                                        required 
                                        value={formData.height}
                                        onChange={handleInputChange}
                                        className="bg-background/50 border-border text-foreground focus:border-[var(--theme-primary)]"
                                    />
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
                                <h2 className="text-xl font-bold text-foreground">Metas y disponibilidad</h2>
                                <p className="text-sm text-muted-foreground">¿Qué quieres lograr y cuánto tiempo tienes?</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="goals" className="text-muted-foreground">¿Cuál es tu objetivo principal?*</Label>
                                <select 
                                    id="goals" 
                                    name="goals" 
                                    required
                                    value={formData.goals}
                                    onChange={handleInputChange}
                                    className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                                >
                                    <option value="">Selecciona tu meta</option>
                                    <option value="Perder grasa">Perder grasa / Definición</option>
                                    <option value="Aumentar masa muscular">Aumentar masa muscular / Volumen</option>
                                    <option value="Recomposición corporal">Recomposición corporal</option>
                                    <option value="Mantenimiento general">Mantenimiento general / Salud</option>
                                    <option value="Rendimiento deportivo">Mejorar rendimiento deportivo</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="experience_level" className="text-muted-foreground">Experiencia*</Label>
                                    <select 
                                        id="experience_level" 
                                        name="experience_level" 
                                        required
                                        value={formData.experience_level}
                                        onChange={handleInputChange}
                                        className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                                    >
                                        <option value="">Nivel</option>
                                        <option value="Principiante">Principiante</option>
                                        <option value="Intermedio">Intermedio</option>
                                        <option value="Avanzado">Avanzado</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="availability" className="text-muted-foreground">Días/semana*</Label>
                                    <select 
                                        id="availability" 
                                        name="availability" 
                                        required
                                        value={formData.availability}
                                        onChange={handleInputChange}
                                        className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                                    >
                                        <option value="">Días</option>
                                        <option value="2 días">2 días</option>
                                        <option value="3 días">3 días</option>
                                        <option value="4 días">4 días</option>
                                        <option value="5 días">5 días</option>
                                        <option value="6+ días">6+ días</option>
                                    </select>
                                </div>
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
                                <h2 className="text-xl font-bold text-foreground">Salud y seguridad</h2>
                                <p className="text-sm text-muted-foreground">Esta información es vital para evitar lesiones.</p>
                            </div>
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="injuries" className="text-muted-foreground">Lesiones o limitaciones</Label>
                                <textarea 
                                    id="injuries" 
                                    name="injuries" 
                                    rows={2}
                                    placeholder="Ej. Dolor en rodilla derecha al correr..." 
                                    value={formData.injuries}
                                    onChange={handleInputChange}
                                    className="flex w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)] placeholder:text-muted-foreground"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="medical_conditions" className="text-muted-foreground">Condiciones médicas</Label>
                                <textarea 
                                    id="medical_conditions" 
                                    name="medical_conditions" 
                                    rows={2}
                                    placeholder="Ej. Hipertensión, asma, diabetes..." 
                                    value={formData.medical_conditions}
                                    onChange={handleInputChange}
                                    className="flex w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)] placeholder:text-muted-foreground"
                                />
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
                            <input type="hidden" name="weight" value={formData.weight} />
                            <input type="hidden" name="height" value={formData.height} />
                            <input type="hidden" name="goals" value={formData.goals} />
                            <input type="hidden" name="experience_level" value={formData.experience_level} />
                            <input type="hidden" name="availability" value={formData.availability} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {state.error && (
                    <div className="mt-4 p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md">
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
                            disabled={!validateCurrentStep()}
                            className="flex-1 h-12 text-white bg-[var(--theme-primary)] hover:opacity-90 ml-auto"
                        >
                            Siguiente
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    ) : (
                        <Button 
                            type="submit" 
                            disabled={isPending}
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
