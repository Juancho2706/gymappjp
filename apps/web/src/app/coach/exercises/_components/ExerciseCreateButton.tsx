'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExerciseFormModal } from './ExerciseFormModal'

export function ExerciseCreateButton() {
    const router = useRouter()
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button type="button" variant="sport" size="sm" onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear ejercicio
            </Button>
            {/* El catálogo llega por props del servidor: sin refresh el coach se queda mirando el grid
                SIN el ejercicio que acaba de crear (mismo `onCreated` que usa el empty state). */}
            {open && (
                <ExerciseFormModal open={open} onClose={() => setOpen(false)} onCreated={() => router.refresh()} />
            )}
        </>
    )
}
