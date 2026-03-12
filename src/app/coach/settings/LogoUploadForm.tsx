'use client'

import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import Image from 'next/image'
import { Upload, Loader2 } from 'lucide-react'
import { updateLogoAction, type BrandSettingsState } from './actions'

const initialState: BrandSettingsState = {}

function UploadButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {pending ? 'Subiendo...' : 'Subir logo'}
        </button>
    )
}

export function LogoUploadForm({
    currentLogoUrl,
    brandName,
}: {
    currentLogoUrl: string | null
    brandName: string
}) {
    const [state, formAction] = useActionState(updateLogoAction, initialState)
    const fileRef = useRef<HTMLInputElement>(null)

    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5">Logo de tu marca</h2>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div className="w-20 h-20 rounded-2xl bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {currentLogoUrl ? (
                        <Image
                            src={currentLogoUrl}
                            alt={brandName}
                            width={80}
                            height={80}
                            className="object-contain"
                        />
                    ) : (
                        <span className="text-3xl font-bold text-muted-foreground">
                            {brandName[0]?.toUpperCase()}
                        </span>
                    )}
                </div>

                <div className="space-y-3 flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">
                        PNG, JPG o SVG. Máximo 2 MB.
                        <br />
                        <span className="text-xs">
                            Recomendado: fondo transparente, cuadrado.
                        </span>
                    </p>
                    <form action={formAction} className="flex flex-wrap items-center gap-3">
                        <input
                            ref={fileRef}
                            name="logo"
                            type="file"
                            accept="image/*"
                            aria-hidden="true"
                            tabIndex={-1}
                            className="sr-only"
                            onChange={() => {
                                fileRef.current?.form?.requestSubmit()
                            }}
                        />
                        <UploadButton />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                        >
                            Seleccionar archivo
                        </button>
                    </form>
                    {state.error && (
                        <p className="text-xs text-destructive">{state.error}</p>
                    )}
                    {state.success && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Logo actualizado.</p>
                    )}
                </div>
            </div>
        </div>
    )
}
