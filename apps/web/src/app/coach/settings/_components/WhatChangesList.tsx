'use client'

import { Palette, ImageIcon, Type, MessageSquare, Zap, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
    {
        icon: Palette,
        label: 'Color de marca',
        desc: 'Botones, activos, gráficos y brillos',
    },
    {
        icon: ImageIcon,
        label: 'Logo',
        desc: 'Login, navegación e instalación',
    },
    {
        icon: Type,
        label: 'Nombre',
        desc: 'Título de la app y pestaña',
    },
    {
        icon: MessageSquare,
        label: 'Mensaje de bienvenida',
        desc: 'Pantalla de login del alumno',
    },
    {
        icon: Zap,
        label: 'Loader animado',
        desc: 'Transiciones de carga',
    },
    {
        icon: Smartphone,
        label: 'Icono de app',
        desc: 'Pantalla de inicio del teléfono',
    },
]

export function WhatChangesList() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {ITEMS.map(({ icon: Icon, label, desc }) => (
                <div
                    key={label}
                    className={cn(
                        'flex items-start gap-3 p-4 rounded-xl border border-border bg-card/50',
                        'hover:bg-card transition-colors'
                    )}
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground">{label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}
