'use client'

import { useActionState, useRef, useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useFormStatus } from 'react-dom'
import Image from 'next/image'
import { Upload, Loader2, ImagePlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { updateLogoAction, type BrandSettingsState } from './_actions/settings.actions'
import { BRAND_LOGO_WEB } from '@/lib/brand-assets'
import { cn } from '@/lib/utils'

const initialState: BrandSettingsState = {}
const MAX_SIZE = 2 * 1024 * 1024

function UploadButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-control border border-default bg-surface-sunken px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-strong disabled:opacity-60"
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
    const formRef = useRef<HTMLFormElement>(null)
    const router = useRouter()
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const previewUrlRef = useRef<string | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    useEffect(() => {
        if (state.success) {
            toast.success('Logo actualizado', { id: 'coach-logo-saved' })
            setPreviewUrl(null)
            router.refresh()
        }
    }, [state.success, router])

    useEffect(() => {
        if (state.error) toast.error(state.error, { id: 'coach-logo-err' })
    }, [state.error])

    useEffect(() => {
        return () => {
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current)
                previewUrlRef.current = null
            }
        }
    }, [])

    const processFile = useCallback((file: File) => {
        if (file.size > MAX_SIZE) {
            toast.error('El archivo supera 2 MB')
            return
        }
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
        }
        const url = URL.createObjectURL(file)
        previewUrlRef.current = url
        setPreviewUrl(url)

        // Inject into hidden file input and submit the form
        const dt = new DataTransfer()
        dt.items.add(file)
        if (fileRef.current) {
            fileRef.current.files = dt.files
            formRef.current?.requestSubmit()
        }
    }, [])

    function handleFileChange() {
        const file = fileRef.current?.files?.[0]
        if (file) processFile(file)
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) processFile(file)
    }

    const displayUrl = previewUrl ?? currentLogoUrl

    return (
        <div className="rounded-card border border-subtle bg-surface-card p-6 shadow-[var(--shadow-sm)]" data-tour-id="brand-logo">
            <div className="mb-5">
                <h2 className="text-base font-bold text-strong">Logo de tu marca</h2>
                <p className="mt-1 text-xs text-muted">
                    También es el ícono que tus alumnos ven al instalar tu app en el teléfono.
                </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                {/* Logo preview */}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-subtle bg-surface-sunken">
                    {displayUrl ? (
                        <Image
                            src={displayUrl}
                            alt={brandName}
                            fill
                            sizes="80px"
                            className="object-contain p-2"
                            priority
                            unoptimized={true}
                        />
                    ) : (
                        <Image
                            src={BRAND_LOGO_WEB}
                            alt="EVA"
                            fill
                            sizes="80px"
                            className="object-contain p-2"
                            priority
                        />
                    )}
                    {previewUrl && (
                        <div className="absolute inset-0 flex items-end justify-center pb-1 bg-black/20">
                            <span className="text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                Vista previa
                            </span>
                        </div>
                    )}
                </div>

                <div className="space-y-3 flex-1 min-w-0 w-full">
                    {/* Drag-and-drop zone */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed p-5 transition-colors',
                            isDragging
                                ? 'border-[var(--sport-500)] bg-[var(--sport-100)]'
                                : 'border-default hover:border-[var(--sport-400)] hover:bg-[var(--sport-100)]'
                        )}
                    >
                        <ImagePlus className={cn('h-6 w-6 transition-colors', isDragging ? 'text-[var(--sport-600)]' : 'text-muted')} />
                        <div className="text-center">
                            <p className="text-sm font-semibold text-strong">
                                {isDragging ? 'Suelta aquí' : 'Arrastra tu logo o haz clic'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted">PNG, JPG o SVG · Máx 2 MB · Recomendado: 512×512 px, fondo transparente</p>
                        </div>
                    </div>

                    <form ref={formRef} action={formAction}>
                        <input
                            ref={fileRef}
                            name="logo"
                            type="file"
                            accept="image/*"
                            aria-hidden="true"
                            tabIndex={-1}
                            className="sr-only"
                            onChange={handleFileChange}
                        />
                        <UploadButton />
                    </form>

                    {state.error && <p className="text-xs" style={{ color: 'var(--danger-600)' }}>{state.error}</p>}
                    {state.success && <p className="text-xs" style={{ color: 'var(--success-700)' }}>✓ Logo actualizado.</p>}
                </div>
            </div>
        </div>
    )
}
