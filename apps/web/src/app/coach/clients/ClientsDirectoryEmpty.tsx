'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Users, UserPlus, FileUp } from 'lucide-react'
import { CreateClientModal } from './CreateClientModal'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Estado vacío — sin alumnos (diseño coach-directory.jsx DirEmptyNoStudents L467-480):
// tile 72px sport-100, título display 900/22 sin uppercase, CTAs apiladas Crear + Importar.
export function ClientsDirectoryEmpty() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="px-4 pb-5 pt-12 text-center">
                <div className="mb-[18px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-sport-100 text-sport-600">
                    <Users className="h-[34px] w-[34px]" />
                </div>
                <h2 className="font-display text-[22px] font-black tracking-[-0.02em] text-strong">
                    Sumá tu primer alumno
                </h2>
                <p className="mx-auto mt-2 max-w-[280px] text-sm leading-normal text-muted">
                    Creá un alumno y recibirá su acceso, o importá tu cartera completa desde
                    Excel/CSV.
                </p>
                <div className="mx-auto mt-[22px] flex max-w-[280px] flex-col gap-2.5">
                    <Button variant="sport" size="lg" className="w-full" onClick={() => setOpen(true)}>
                        <UserPlus className="h-5 w-5" />
                        Crear alumno
                    </Button>
                    <Link
                        href="/coach/clients/import"
                        className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
                    >
                        <FileUp className="h-5 w-5" />
                        Importar cartera
                    </Link>
                </div>
            </div>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
