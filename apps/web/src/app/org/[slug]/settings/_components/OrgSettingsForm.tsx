'use client'

import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Save, Upload } from 'lucide-react'
import { updateOrgAction, uploadOrgLogoAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    defaultName: string
    defaultColor: string
    currentLogoUrl?: string | null
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
        </button>
    )
}

export function OrgSettingsForm({ orgSlug, defaultName, defaultColor, currentLogoUrl }: Props) {
    const [state, action] = useActionState(
        async (_: unknown, formData: FormData) => updateOrgAction(orgSlug, formData),
        null
    )
    const [logoState, logoAction] = useActionState(
        async (_: unknown, formData: FormData) => uploadOrgLogoAction(orgSlug, formData),
        null
    )
    const logoInputRef = useRef<HTMLInputElement>(null)

    return (
        <div className="space-y-5">
            {/* Logo upload — separate form to avoid resetting text fields */}
            <form action={logoAction} className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Logo de la organización</label>
                <div className="flex items-center gap-3">
                    {(logoState?.logoUrl ?? currentLogoUrl) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoState?.logoUrl ?? currentLogoUrl ?? ''}
                            alt="Logo"
                            className="w-10 h-10 rounded-lg object-cover border border-border"
                        />
                    )}
                    <input
                        ref={logoInputRef}
                        name="logo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files?.[0]) {
                                e.target.form?.requestSubmit()
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Subir logo
                    </button>
                    <span className="text-[11px] text-muted-foreground">JPG, PNG, WebP, GIF · máx 2 MB</span>
                </div>
                {logoState?.error && <p className="text-xs text-red-400">{logoState.error}</p>}
                {logoState?.success && <p className="text-xs text-emerald-500">Logo actualizado</p>}
            </form>

            <div className="border-t border-border/60" />

            {/* Name + color form */}
            <form action={action} className="space-y-3">
                <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Nombre</label>
                    <input
                        name="name"
                        required
                        defaultValue={defaultName}
                        maxLength={80}
                        className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Color primario</label>
                    <div className="flex items-center gap-2">
                        <input
                            name="primary_color"
                            type="color"
                            defaultValue={defaultColor || '#10B981'}
                            className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5"
                        />
                        <span className="text-xs text-muted-foreground">Color de la organización</span>
                    </div>
                </div>
                {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
                {state?.success && <p className="text-xs text-emerald-500">Configuración guardada</p>}
                <div className="flex justify-end">
                    <SubmitButton />
                </div>
            </form>
        </div>
    )
}
