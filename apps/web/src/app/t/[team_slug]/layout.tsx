import type { Metadata, Viewport } from 'next'
import { BRAND_APP_ICON, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { InstallPrompt } from '@/components/InstallPrompt'
import { getTeamLoginInfo } from './login/_data/login.queries'

interface Props {
    children: React.ReactNode
    params: Promise<{ team_slug: string }>
}

// Apple PWA splash screens (device CSS px + pixel ratio → physical px for the image).
// Mismo set que el árbol /c. El route /api/splash/[coach_slug] acepta cualquier slug y
// resuelve la marca del TEAM desde el cliente autenticado (pool); pre-auth cae a EVA.
const APPLE_SPLASH: { dw: number; dh: number; r: number }[] = [
    { dw: 320, dh: 568, r: 2 }, // SE 1
    { dw: 375, dh: 667, r: 2 }, // 8 / SE 2-3
    { dw: 414, dh: 736, r: 3 }, // 8 Plus
    { dw: 375, dh: 812, r: 3 }, // X / 11 Pro / 12 mini
    { dw: 414, dh: 896, r: 2 }, // XR / 11
    { dw: 414, dh: 896, r: 3 }, // XS Max / 11 Pro Max
    { dw: 390, dh: 844, r: 3 }, // 12 / 13 / 14
    { dw: 428, dh: 926, r: 3 }, // 12/13 Pro Max
    { dw: 393, dh: 852, r: 3 }, // 14 Pro / 15
    { dw: 430, dh: 932, r: 3 }, // 14/15 Pro Max
    { dw: 768, dh: 1024, r: 2 }, // iPad
]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { team_slug } = await params
    // Team-scoped branding (un link de entrada por pool). Service-role read keyed by slug,
    // funciona en las native pages pre-auth (login/consent) donde no hay headers del proxy.
    const team = await getTeamLoginInfo(team_slug)
    const brandName = team?.name ?? 'Tu equipo'

    return {
        title: {
            default: brandName,
            template: `%s | ${brandName}`,
        },
        description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
        // NO seteamos `manifest` aquí: Next no permite añadir crossOrigin al <link> que genera.
        // El manifest se renderiza crudo en el JSX (con crossOrigin="use-credentials").
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: team?.logo_url
            ? {
                icon: [{ url: team.logo_url }],
                shortcut: [{ url: team.logo_url }],
                apple: [{ url: team.logo_url }],
            }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
    }
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
    const { team_slug } = await params
    const team = await getTeamLoginInfo(team_slug)

    return {
        // Tinte de la status bar en Android. iOS usa black-translucent (cosmético allí),
        // pero igual lo emitimos.
        themeColor: team?.primary_color ?? SYSTEM_PRIMARY_COLOR,
    }
}

export default async function TeamBrandLayout({ children, params }: Props) {
    const { team_slug } = await params
    const team = await getTeamLoginInfo(team_slug)
    const brandName = team?.name ?? 'Tu equipo'
    const primaryColor = team?.primary_color ?? SYSTEM_PRIMARY_COLOR
    const logoUrl = team?.logo_url ?? BRAND_APP_ICON

    return (
        <>
            {/* Manifest crudo: el route resuelve la marca desde el team_id del cliente autenticado,
                cualquier slug válido sirve; pasamos el team_slug del árbol. crossOrigin necesario
                para que el manifest se sirva con credenciales (cookies de sesión). */}
            <link
                rel="manifest"
                href={`/api/manifest/${team_slug}`}
                crossOrigin="use-credentials"
            />
            {APPLE_SPLASH.map(({ dw, dh, r }) => (
                <link
                    key={`${dw}x${dh}@${r}`}
                    rel="apple-touch-startup-image"
                    media={`screen and (device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
                    href={`/api/splash/${team_slug}?w=${dw * r}&h=${dh * r}`}
                />
            ))}
            {children}
            <InstallPrompt
                brandName={brandName}
                logoUrl={team?.logo_url ?? undefined}
                coachInitial={brandName.charAt(0)}
                primaryColor={primaryColor}
            />
        </>
    )
}
