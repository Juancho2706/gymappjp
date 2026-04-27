'use client'

import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandSettingsTour } from './BrandSettingsTour'
import type { BrandTourStep } from './BrandSettingsTour'

const storageKey = (coachId: string) => `eva:brand-settings-tour-seen:${coachId}`

const TOUR_STEPS: BrandTourStep[] = [
    {
        id: 'brand-header',
        title: 'Tu marca en la app de tus alumnos',
        description: 'Aquí personalizas cómo ven tus alumnos la app cuando la instalan en su teléfono. Cada alumno verá tu logo, colores y nombre.',
    },
    {
        id: 'brand-logo',
        title: 'Logo de tu marca',
        description: 'Sube tu logo. Aparece en la pantalla de login, la navegación lateral y cuando los alumnos instalan la app en su teléfono.',
    },
    {
        id: 'brand-identity',
        title: 'Identidad de tu marca',
        description: 'Define tu nombre de marca, la URL única que compartes con tus alumnos y un mensaje de bienvenida. Tu URL solo se puede cambiar cada 30 días para proteger los links compartidos.',
    },
    {
        id: 'brand-color',
        title: 'Color de marca',
        description: 'Elige el color principal. Se aplica automáticamente a botones, elementos activos, gráficos y brillos de tu app. Generamos variantes más claras y oscuras por ti.',
    },
    {
        id: 'brand-loader',
        title: 'Loader animado',
        description: 'Personaliza la animación que aparece cuando tus alumnos cargan la app o navegan entre páginas. Puedes usar tu propio texto y color.',
    },
    {
        id: 'brand-welcome-modal',
        title: 'Mensaje de bienvenida al dashboard',
        description: 'Envía un mensaje o video a tus alumnos cada vez que entran a su dashboard. Ideal para anuncios, motivación o instrucciones semanales. Tus alumnos pueden cerrarlo y elegir no verlo hasta que haya un mensaje nuevo.',
    },
    {
        id: 'brand-share',
        title: 'Compartir con alumnos',
        description: 'Copia el link o muestra el QR en tu gym para que tus alumnos accedan a tu app. Al instalarla, verán tu marca en vez de EVA.',
    },
    {
        id: 'brand-preview',
        title: 'Vista previa en vivo',
        description: 'Activa el modo oscuro para ver cómo se ve tu app en ambos temas antes de guardar. Así tus alumnos tendrán una experiencia consistente.',
    },
    {
        id: 'brand-save',
        title: 'Guardar cambios',
        description: 'El botón flotante siempre está disponible mientras scrolleas. Cuando termines de personalizar, guarda para que tus alumnos vean tu marca actualizada al instante.',
    },
]

export function BrandSettingsTourClient({ coachId }: { coachId: string }) {
    const [tourOpen, setTourOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const key = storageKey(coachId)

    useEffect(() => {
        setMounted(true)
        try {
            const seen = localStorage.getItem(key)
            if (seen !== 'true') {
                const timer = setTimeout(() => setTourOpen(true), 600)
                return () => clearTimeout(timer)
            }
        } catch {
            // localStorage no disponible
        }
    }, [key])

    useEffect(() => {
        const handler = () => setTourOpen(true)
        window.addEventListener('brand-tour-start', handler)
        return () => window.removeEventListener('brand-tour-start', handler)
    }, [])

    const handleCloseTour = () => {
        setTourOpen(false)
        try {
            localStorage.setItem(key, 'true')
        } catch {
            /* ignore */
        }
    }

    const handleRestartTour = () => {
        setTourOpen(true)
    }

    if (!mounted) return null

    return (
        <>
            {/* Floating help button (desktop only; mobile lives inside BrandThemePreview header) */}
            <div className="fixed bottom-[calc(var(--mobile-content-bottom-offset,0px)+1rem)] left-4 z-[60] hidden md:block md:absolute md:top-6 md:right-8 md:left-auto md:bottom-auto">
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-11 w-11 rounded-full shadow-lg border border-border bg-card hover:bg-muted"
                    onClick={handleRestartTour}
                    title="Ver guía del panel Mi Marca"
                    aria-label="Ver guía del panel Mi Marca"
                >
                    <HelpCircle className="w-5 h-5 text-muted-foreground" />
                </Button>
            </div>

            <BrandSettingsTour
                open={tourOpen}
                steps={TOUR_STEPS}
                onClose={handleCloseTour}
            />
        </>
    )
}
