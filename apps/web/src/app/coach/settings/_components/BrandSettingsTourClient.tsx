'use client'

import { useEffect, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandSettingsTour } from './BrandSettingsTour'
import type { BrandTourStep } from './BrandSettingsTour'
import {
    brandTourSeenStorageKey,
    BRAND_TOUR_SEEN_CHANGED_EVENT,
    type BrandTourSeenChangedDetail,
} from '@/lib/coach-brand-tour'
import { markBrandTourSeenAction } from '@/app/coach/dashboard/_actions/onboarding-guide.actions'
import { useOnboardingMode } from '@/components/coach/OnboardingModeContext'

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

export function BrandSettingsTourClient({
    coachId,
    brandTourSeenServer,
}: {
    coachId: string
    brandTourSeenServer?: boolean
}) {
    const [tourOpen, setTourOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const key = brandTourSeenStorageKey(coachId)
    // «Un solo onboarding por área» (owner 22-08): con la guía del coach ACTIVA, este tour NO se
    // abre solo — ni por el `?tour=1` con el que llegaba el paso 1 de la guía, ni por el temporizador
    // de primera visita. El «?» de la esquina lo sigue abriendo, y no se marca como visto: cuando la
    // guía termine, la próxima entrada a Mi Marca lo mostrará como siempre.
    const { guideActive } = useOnboardingMode()

    useEffect(() => {
        setMounted(true)
        try {
            const params = new URLSearchParams(window.location.search)
            if (params.get('tour') === '1') {
                // El param se limpia IGUAL (aunque no se abra nada): si no, queda pegado en la URL
                // y un refresh más tarde —ya sin guía— dispararía el tour por sorpresa.
                if (!guideActive) setTourOpen(true)
                const u = new URL(window.location.href)
                u.searchParams.delete('tour')
                const next = u.pathname + (u.search ? u.search : '')
                window.history.replaceState({}, '', next)
                return
            }
            // Merge server value with localStorage: server wins for "seen"
            const lsSeen = localStorage.getItem(key) === 'true'
            const initialSeen = brandTourSeenServer === true || lsSeen
            if (initialSeen) {
                // Ensure localStorage stays in sync with server value
                if (brandTourSeenServer === true && !lsSeen) {
                    localStorage.setItem(key, 'true')
                }
                return
            }
            if (guideActive) return
            const timer = setTimeout(() => setTourOpen(true), 600)
            return () => clearTimeout(timer)
        } catch {
            // localStorage / URL no disponible
        }
        // `guideActive` a propósito FUERA de las deps: el modo se congela en el primer montaje
        // (mismo criterio que `useTourController`). Si el coach cierra la guía sin salir de esta
        // pantalla, el tour no le salta encima; lo verá la próxima vez que entre.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, brandTourSeenServer])

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
        try {
            window.dispatchEvent(
                new CustomEvent(BRAND_TOUR_SEEN_CHANGED_EVENT, {
                    detail: { coachId } satisfies BrandTourSeenChangedDetail,
                })
            )
        } catch {
            /* ignore */
        }
        markBrandTourSeenAction().catch(() => null)
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
