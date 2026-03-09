'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { CreateClientModal } from './CreateClientModal'

export function ClientsHeader() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="flex items-center justify-between mb-8">
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
                </div>
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-primary/20"
                >
                    <UserPlus className="w-4 h-4" />
                    Nuevo Alumno
                </button>
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
