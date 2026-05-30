'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ExerciseFormModal } from './ExerciseFormModal'

export function ExerciseCreateButton() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
                <Plus className="h-4 w-4" />
                Crear ejercicio
            </button>
            {open && <ExerciseFormModal open={open} onClose={() => setOpen(false)} />}
        </>
    )
}
