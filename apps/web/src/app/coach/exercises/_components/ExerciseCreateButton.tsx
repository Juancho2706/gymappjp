'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExerciseFormModal } from './ExerciseFormModal'

export function ExerciseCreateButton() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button type="button" variant="sport" size="sm" onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear ejercicio
            </Button>
            {open && <ExerciseFormModal open={open} onClose={() => setOpen(false)} />}
        </>
    )
}
