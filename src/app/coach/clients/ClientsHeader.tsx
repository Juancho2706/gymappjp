'use client'

import { useState } from 'react'
import { UserPlus, Copy, Check } from 'lucide-react'
import { CreateClientModal } from './CreateClientModal'

interface ClientsHeaderProps {
    coachSlug?: string
    appUrl?: string
}

export function ClientsHeader({ coachSlug, appUrl }: ClientsHeaderProps) {
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    const loginUrl = coachSlug && appUrl ? `${appUrl}/c/${coachSlug}/login` : ''

    const handleCopy = () => {
        if (loginUrl) {
            navigator.clipboard.writeText(loginUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1
                        className="text-2xl font-extrabold text-foreground"
                        style={{ fontFamily: 'var(--font-outfit)' }}
                    >
                        Mis Alumnos
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gestiona y crea las cuentas de tus clientes.
                    </p>
                    {loginUrl && (
                        <div className="mt-3 flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 w-fit cursor-pointer hover:bg-secondary transition-colors" onClick={handleCopy}>
                            <span className="text-xs text-muted-foreground font-medium">Link para alumnos:</span>
                            <span className="text-xs text-primary font-semibold">{loginUrl}</span>
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-primary/20 w-full md:w-auto"
                >
                    <UserPlus className="w-4 h-4" />
                    Nuevo Alumno
                </button>
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
