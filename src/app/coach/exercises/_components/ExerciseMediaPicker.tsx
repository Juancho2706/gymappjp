'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { FileImage, Image as ImageIcon, Loader2, Play, Upload, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { normalizeYoutubeEmbedUrl } from '@/lib/youtube'
import { uploadExerciseMediaAction } from '../_actions/exercise-media.actions'
import { EXERCISE_MEDIA_LIMITS } from '@/lib/uploads/image-validation'

export type MediaKind = 'youtube' | 'gif' | 'image'

export interface MediaValue {
    kind: MediaKind
    /** URL ya válida (YouTube original o Supabase public URL). Vacío si nada cargado. */
    value: string
}

interface Props {
    value: MediaValue
    onChange: (next: MediaValue) => void
    /** Para mostrar errores de Zod del campo asociado. */
    error?: string
}

const TABS: { kind: MediaKind; label: string; icon: typeof Play }[] = [
    { kind: 'youtube', label: 'YouTube', icon: Play },
    { kind: 'gif', label: 'GIF', icon: FileImage },
    { kind: 'image', label: 'Imagen', icon: ImageIcon },
]

/**
 * Tabs YouTube / GIF / Imagen. Solo UN medium por exercise.
 * Cambiar de tab con contenido cargado pide confirmación.
 */
export function ExerciseMediaPicker({ value, onChange, error }: Props) {
    const [activeTab, setActiveTab] = useState<MediaKind>(value.kind)

    useEffect(() => {
        setActiveTab(value.kind)
    }, [value.kind])

    const handleTabChange = (next: MediaKind) => {
        if (next === activeTab) return
        if (value.value && next !== value.kind) {
            const ok = window.confirm(
                'Vas a cambiar el tipo de medio. Se descartará lo cargado actualmente. ¿Continuar?'
            )
            if (!ok) return
        }
        setActiveTab(next)
        onChange({ kind: next, value: '' })
    }

    return (
        <div className="space-y-3">
            <div className="flex gap-1.5 p-1 bg-muted/50 rounded-xl border border-border">
                {TABS.map(({ kind, label, icon: Icon }) => {
                    const active = activeTab === kind
                    return (
                        <button
                            key={kind}
                            type="button"
                            onClick={() => handleTabChange(kind)}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                                active
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                            aria-pressed={active}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    )
                })}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
                {activeTab === 'youtube' && (
                    <YoutubePanel
                        value={value.kind === 'youtube' ? value.value : ''}
                        onChange={(v) => onChange({ kind: 'youtube', value: v })}
                    />
                )}
                {activeTab === 'gif' && (
                    <FileUploadPanel
                        kind="gif"
                        value={value.kind === 'gif' ? value.value : ''}
                        onChange={(v) => onChange({ kind: 'gif', value: v })}
                    />
                )}
                {activeTab === 'image' && (
                    <FileUploadPanel
                        kind="image"
                        value={value.kind === 'image' ? value.value : ''}
                        onChange={(v) => onChange({ kind: 'image', value: v })}
                    />
                )}
            </div>

            {error && (
                <p className="text-xs text-destructive" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}

// ─── YouTube Tab ──────────────────────────────────────────────────────────────

function YoutubePanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const embedUrl = value ? normalizeYoutubeEmbedUrl(value) : null

    return (
        <div className="space-y-3">
            <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    URL del video YouTube
                </label>
                <Input
                    type="url"
                    placeholder="https://youtu.be/..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                    Pegá el link. Asegurate que el video sea <strong>Unlisted</strong> o Público en YouTube.
                </p>
            </div>
            {embedUrl && (
                <div className="rounded-xl overflow-hidden border border-border aspect-video bg-black">
                    <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allow="encrypted-media; picture-in-picture"
                        title="Preview del video"
                    />
                </div>
            )}
            {value && !embedUrl && (
                <p className="text-xs text-amber-500">
                    URL inválida. Usá un link de youtube.com o youtu.be.
                </p>
            )}
        </div>
    )
}

// ─── File Upload Tab (GIF + Image) ────────────────────────────────────────────

interface FileUploadProps {
    kind: 'gif' | 'image'
    value: string
    onChange: (v: string) => void
}

function FileUploadPanel({ kind, value, onChange }: FileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)
    const [localPreview, setLocalPreview] = useState<string | null>(null)
    const [isUploading, startUpload] = useTransition()

    const accept = kind === 'gif' ? 'image/gif' : 'image/jpeg,image/png,image/webp'
    const maxSizeMB =
        kind === 'gif'
            ? EXERCISE_MEDIA_LIMITS.gifPreCompressMaxBytes / 1024 / 1024
            : EXERCISE_MEDIA_LIMITS.maxBytes / 1024 / 1024
    const helpText =
        kind === 'gif'
            ? `GIF animado. Máximo ${maxSizeMB} MB.`
            : `JPEG, PNG o WebP. Comprimimos automáticamente (máx ${maxSizeMB} MB final).`

    useEffect(() => {
        // Limpiar object URL al desmontar para no leakear memoria
        return () => {
            if (localPreview) URL.revokeObjectURL(localPreview)
        }
    }, [localPreview])

    const processFile = (file: File) => {
        if (!file) return

        // Pre-check tipo
        const allowedTypes =
            kind === 'gif'
                ? ['image/gif']
                : ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            toast.error(`Tipo no permitido. Se esperaba ${kind === 'gif' ? 'GIF' : 'JPEG/PNG/WebP'}.`)
            return
        }

        // Pre-check tamaño
        const hardMax =
            kind === 'gif'
                ? EXERCISE_MEDIA_LIMITS.gifPreCompressMaxBytes
                : 10 * 1024 * 1024 // Imágenes: aceptamos hasta 10MB antes de compresión
        if (file.size > hardMax) {
            toast.error(`Archivo muy grande (máximo ${(hardMax / 1024 / 1024).toFixed(0)} MB).`)
            return
        }

        // Preview local mientras sube
        const previewUrl = URL.createObjectURL(file)
        setLocalPreview(previewUrl)

        startUpload(async () => {
            try {
                let toUpload: File = file

                if (kind === 'image') {
                    // Comprimir client-side a WebP <= 2MB con max 1280px
                    const { default: imageCompression } = await import('browser-image-compression')
                    const compressed = await imageCompression(file, {
                        maxSizeMB: 2,
                        maxWidthOrHeight: 1280,
                        useWebWorker: true,
                        fileType: 'image/webp',
                        initialQuality: 0.85,
                    })
                    toUpload = new File([compressed], 'compressed.webp', { type: 'image/webp' })
                }

                const fd = new FormData()
                fd.append('file', toUpload)
                const res = await uploadExerciseMediaAction(fd)

                if (!res.success) {
                    toast.error(res.error)
                    setLocalPreview(null)
                    URL.revokeObjectURL(previewUrl)
                    return
                }

                onChange(res.url)
                toast.success('Medio subido correctamente.')
                // Reemplazar preview local con URL subida (libera blob)
                URL.revokeObjectURL(previewUrl)
                setLocalPreview(null)
            } catch (err) {
                console.error('upload error:', err)
                toast.error('Error al procesar el archivo.')
                setLocalPreview(null)
                URL.revokeObjectURL(previewUrl)
            }
        })
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) processFile(file)
        // Reset input para permitir re-subir el mismo file si fue rechazado
        if (inputRef.current) inputRef.current.value = ''
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) processFile(file)
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))
        if (item) {
            const file = item.getAsFile()
            if (file) processFile(file)
        }
    }

    const clearMedia = () => {
        onChange('')
        if (localPreview) {
            URL.revokeObjectURL(localPreview)
            setLocalPreview(null)
        }
    }

    const displayUrl = value || localPreview

    return (
        <div className="space-y-3" onPaste={handlePaste}>
            {!displayUrl ? (
                <div
                    onDragOver={(e) => {
                        e.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label={`Subir ${kind === 'gif' ? 'GIF' : 'imagen'}`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            inputRef.current?.click()
                        }
                    }}
                    className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        dragging
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40 hover:bg-muted/30'
                    } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        className="sr-only"
                        onChange={handleFileChange}
                    />
                    {isUploading ? (
                        <>
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm font-semibold text-foreground">Subiendo...</p>
                        </>
                    ) : (
                        <>
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                                <Upload className="w-6 h-6 text-primary" />
                            </div>
                            <p className="text-sm font-semibold text-foreground">
                                Arrastrá o hacé click para subir
                            </p>
                            <p className="text-xs text-muted-foreground text-center">{helpText}</p>
                            <p className="text-[10px] text-muted-foreground/70">
                                También podés pegar (Ctrl+V) una imagen
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="relative rounded-xl overflow-hidden border border-border bg-card">
                    <div className="relative aspect-video bg-muted">
                        <Image
                            src={displayUrl}
                            alt="Preview"
                            fill
                            className="object-contain"
                            unoptimized
                        />
                        {isUploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Loader2 className="w-8 h-8 text-white animate-spin" />
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={clearMedia}
                        disabled={isUploading}
                        className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
                        aria-label="Quitar archivo"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}
