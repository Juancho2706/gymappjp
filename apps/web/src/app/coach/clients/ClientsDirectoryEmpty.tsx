'use client'

import Link from 'next/link'
import { Users, UserPlus, FileUp } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAddStudentFlow } from './_components/add-student-flow-context'

// Estado vacío — sin alumnos (diseño coach-directory.jsx DirEmptyNoStudents L467-480):
// tile 72px sport-100, título display 900/22 sin uppercase, CTAs apiladas Crear + Importar.
//
// Onboarding v2 (F4.1): el alta la abre el flujo del directorio, que en el PRIMER alta real
// manda al stepper guiado de 3 pasos en vez del modal. El modal ya no se monta acá.
export function ClientsDirectoryEmpty() {
    const flow = useAddStudentFlow()

    return (
        <div className="px-4 pb-5 pt-12 text-center">
            <div className="mb-[18px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-sport-100 text-sport-600">
                <Users className="h-[34px] w-[34px]" />
            </div>
            <h2 className="font-display text-[22px] font-black tracking-[-0.02em] text-strong">
                Suma tu primer alumno
            </h2>
            <p className="mx-auto mt-2 max-w-[280px] text-sm leading-normal text-muted">
                Crea un alumno y recibirá su acceso, o importa tu cartera completa desde
                Excel/CSV.
            </p>
            <div className="mx-auto mt-[22px] flex max-w-[280px] flex-col gap-2.5">
                <Button variant="sport" size="lg" className="w-full" onClick={flow.start}>
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
    )
}
