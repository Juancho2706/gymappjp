import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { DemoStateProvider } from './_providers/DemoStateProvider'
import { DemoBanner } from './_components/DemoBanner'
import { generateBrandPalette } from '@/lib/color-utils'

const MOVIDA_PRIMARY = '#0D9488'

export const metadata: Metadata = {
    title: {
        default: 'Movida — Demo EVA',
        template: '%s | Movida Demo',
    },
    description: 'Demo interactiva de EVA para Movida Centro de Salud Integral, Viña del Mar.',
    robots: { index: false, follow: false },
}

export default function MovidaDemoLayout({ children }: { children: React.ReactNode }) {
    const palette = generateBrandPalette(MOVIDA_PRIMARY)

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                    :root {
                        --theme-primary: ${palette.primary};
                        --theme-primary-rgb: ${palette.primaryRgb};
                        --theme-primary-dark: ${palette.primaryDark};
                        --theme-primary-light: ${palette.primaryLight};
                        --theme-primary-surface: ${palette.primarySurface};
                        --theme-primary-glow: ${palette.primaryGlow};
                        --theme-primary-foreground: ${palette.primaryForeground};
                        --primary: ${palette.primary};
                        --primary-foreground: ${palette.primaryForeground};
                    }
                `
            }} />
            <DemoStateProvider>
                <DemoBanner />
                {children}
            </DemoStateProvider>
            <Toaster richColors position="bottom-center" />
        </>
    )
}
