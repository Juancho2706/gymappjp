'use client'

import { DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'

export function SettingsModalTrigger() {
    return (
        <DialogTrigger
            render={
                <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 rounded-xl transition-colors hover:bg-muted/50"
                />
            }
        >
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="sr-only">Configuración</span>
        </DialogTrigger>
    )
}
