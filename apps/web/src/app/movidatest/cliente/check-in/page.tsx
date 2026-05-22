'use client'

import { useState } from 'react'
import { Camera, Scale, Moon, Zap, CheckCircle2 } from 'lucide-react'
import { useDemoActions } from '../../_providers/DemoStateProvider'
import { MOVIDA_BRAND } from '../../_mock'

const ENERGY_LABELS = ['Muy bajo', 'Bajo', 'Normal', 'Bueno', 'Excelente']
const ENERGY_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981']

export default function CheckInPage() {
    const actions = useDemoActions()
    const [weight, setWeight] = useState('69.2')
    const [energy, setEnergy] = useState(4)
    const [sleep, setSleep] = useState('7.5')
    const [notes, setNotes] = useState('')
    const [submitted, setSubmitted] = useState(false)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        actions.addCheckIn({
            id: `ci-demo-${Date.now()}`,
            date: new Date().toISOString(),
            weight_kg: parseFloat(weight) || 69.2,
            energy_level: energy,
            sleep_hours: parseFloat(sleep) || 7.5,
            notes,
            has_photo: false,
        })
        setSubmitted(true)
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-teal-500" />
                </div>
                <h2 className="text-xl font-bold">¡Check-in registrado!</h2>
                <p className="text-sm text-muted-foreground">Felipe verá tu progreso en el próximo control.</p>
                <button
                    onClick={() => setSubmitted(false)}
                    className="text-xs font-medium"
                    style={{ color: MOVIDA_BRAND.primaryColor }}
                >
                    Hacer otro check-in
                </button>
            </div>
        )
    }

    return (
        <div className="pb-4">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-card">
                <h1 className="text-sm font-bold">Check-in semanal</h1>
                <p className="text-[11px] text-muted-foreground">Registra tu progreso de hoy</p>
            </div>

            <form onSubmit={handleSubmit} className="px-4 mt-4 space-y-4">
                {/* Weight */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Scale className="w-4 h-4" style={{ color: MOVIDA_BRAND.primaryColor }} />
                        <span className="text-sm font-semibold">Peso corporal</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            step="0.1"
                            value={weight}
                            onChange={e => setWeight(e.target.value)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-3 text-center text-2xl font-bold focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': MOVIDA_BRAND.primaryColor } as React.CSSProperties}
                        />
                        <span className="text-lg font-semibold text-muted-foreground">kg</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">Meta: 65 kg · Diferencia: +{(parseFloat(weight) - 65).toFixed(1)} kg</p>
                </div>

                {/* Energy level */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4" style={{ color: MOVIDA_BRAND.primaryColor }} />
                        <span className="text-sm font-semibold">Nivel de energía</span>
                    </div>
                    <div className="flex gap-2">
                        {ENERGY_LABELS.map((label, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setEnergy(i + 1)}
                                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all ${
                                    energy === i + 1 ? 'border-2' : 'border-border bg-muted/30'
                                }`}
                                style={energy === i + 1 ? { borderColor: ENERGY_COLORS[i], backgroundColor: `${ENERGY_COLORS[i]}15` } : {}}
                            >
                                <span className="text-base">{['😴', '😕', '😐', '😊', '🔥'][i]}</span>
                                <span className="text-[9px] text-muted-foreground leading-tight text-center">{label}</span>
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-center mt-2 font-medium" style={{ color: ENERGY_COLORS[energy - 1] }}>
                        {ENERGY_LABELS[energy - 1]}
                    </p>
                </div>

                {/* Sleep */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Moon className="w-4 h-4" style={{ color: MOVIDA_BRAND.primaryColor }} />
                        <span className="text-sm font-semibold">Horas de sueño</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={sleep}
                            onChange={e => setSleep(e.target.value)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-3 text-center text-2xl font-bold focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': MOVIDA_BRAND.primaryColor } as React.CSSProperties}
                        />
                        <span className="text-lg font-semibold text-muted-foreground">hrs</span>
                    </div>
                </div>

                {/* Photo placeholder */}
                <div className="rounded-xl border border-dashed border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Camera className="w-4 h-4" style={{ color: MOVIDA_BRAND.primaryColor }} />
                        <span className="text-sm font-semibold">Foto de progreso</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">opcional</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => actions.simulateAction('Subir foto de progreso')}
                        className="w-full h-28 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/30 transition-colors"
                    >
                        <Camera className="w-6 h-6 opacity-40" />
                        <span className="text-xs">Toca para agregar foto</span>
                    </button>
                </div>

                {/* Notes */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-semibold mb-2">Notas (opcional)</p>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="¿Cómo te has sentido esta semana? ¿Algún dolor o molestia?"
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                        style={{ '--tw-ring-color': MOVIDA_BRAND.primaryColor } as React.CSSProperties}
                    />
                </div>

                <button
                    type="submit"
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}
                >
                    Enviar check-in
                </button>
            </form>
        </div>
    )
}
