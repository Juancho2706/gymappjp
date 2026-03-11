'use client'

import { useActionState, useState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Camera, CheckCircle2, Loader2, UploadCloud, X } from 'lucide-react'
import Image from 'next/image'
import { submitCheckinAction, type CheckinState } from './actions'
import { useRouter } from 'next/navigation'

const initialState: CheckinState = {}

export function CheckInForm({ coachSlug, coachPrimaryColor }: { coachSlug: string, coachPrimaryColor: string }) {
    const router = useRouter()
    const [state, formAction] = useActionState(submitCheckinAction, initialState)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    if (state.success) {
        return (
            <div className="bg-card border border-border rounded-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">¡Check-in Enviado!</h3>
                <p className="text-muted-foreground text-sm mb-6">Tu coach ha recibido tu actualización semanal.</p>
                <button
                    onClick={() => router.push(`/c/${coachSlug}/dashboard`)}
                    className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-all text-white w-full"
                    style={{ backgroundColor: coachPrimaryColor }}
                >
                    Volver al Inicio
                </button>
            </div>
        )
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (file) {
            const url = URL.createObjectURL(file)
            setPreviewUrl(url)
        }
    }

    return (
        <form action={formAction} className="bg-card border border-border rounded-2xl p-6 space-y-6">
            <div className="space-y-4">
                {/* Weight Input */}
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5" htmlFor="weight">
                        Peso actual (kg)
                    </label>
                    <input
                        id="weight"
                        name="weight"
                        type="number"
                        step="0.1"
                        min="20"
                        max="400"
                        required
                        placeholder="75.5"
                        className="w-full h-11 px-3.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors"
                        style={{ borderBottomColor: `var(--theme-primary, ${coachPrimaryColor})` }}
                    />
                </div>

                {/* Energy Level */}
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5" htmlFor="energy_level">
                        Nivel de energía (1-10)
                    </label>
                    <div className="flex items-center gap-4">
                        <input
                            id="energy_level"
                            name="energy_level"
                            type="range"
                            min="1"
                            max="10"
                            defaultValue="7"
                            className="flex-1"
                            style={{ accentColor: coachPrimaryColor }}
                            onChange={(e) => {
                                const val = document.getElementById('energy-val')
                                if (val) val.innerText = e.target.value
                            }}
                        />
                        <span id="energy-val" className="w-6 text-center text-lg font-bold text-foreground">7</span>
                    </div>
                </div>

                {/* Progress Photo */}
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                        Foto de progreso (Frontal) <span className="text-muted-foreground text-xs font-normal">— Opcional</span>
                    </label>

                    <input
                        type="file"
                        id="photo"
                        name="photo"
                        accept="image/*"
                        className="sr-only"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />

                    {previewUrl ? (
                        <div className="relative w-full aspect-[3/4] max-h-80 rounded-xl overflow-hidden group">
                            <Image src={previewUrl} alt="Preview" fill className="object-cover" />
                            <div className="absolute inset-0 bg-background/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPreviewUrl(null)
                                        if (fileInputRef.current) fileInputRef.current.value = ''
                                    }}
                                    className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex flex-col items-center justify-center py-6 border-2 border-dashed border-border rounded-xl hover:border-muted-foreground hover:bg-secondary/50 transition-colors"
                        >
                            <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                            <span className="text-sm font-medium text-muted-foreground">Seleccionar foto</span>
                            <span className="text-xs text-muted-foreground mt-1">Formatos: JPG, PNG, WEBP</span>
                        </button>
                    )}
                </div>

                {/* Notes */}
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5" htmlFor="notes">
                        Notas de la semana <span className="text-muted-foreground text-xs font-normal">— Opcional</span>
                    </label>
                    <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        placeholder="Ej: Me costó dormir el martes, pero en el gym sentí un aumento de fuerza..."
                        className="w-full p-3.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors resize-none"
                    />
                </div>
            </div>

            {state.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {state.error}
                </div>
            )}

            <SubmitButton color={coachPrimaryColor} />
        </form>
    )
}

function SubmitButton({ color }: { color: string }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all text-white disabled:opacity-50"
            style={{ backgroundColor: color }}
        >
            {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            {pending ? 'Enviando Reporte...' : 'Enviar Check-in'}
        </button>
    )
}
