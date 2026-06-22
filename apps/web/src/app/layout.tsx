import type { Metadata, Viewport } from 'next'
import {
  Inter, Montserrat,
  Plus_Jakarta_Sans, Hanken_Grotesk, Manrope, Poppins, Sora,
  Space_Grotesk, Outfit, Figtree, DM_Sans, Lexend,
} from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PwaRegister } from '@/components/PwaRegister'
import { ScrollRestoration } from '@/components/ScrollRestoration'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_OG_IMAGE, BRAND_OG_IMAGE_HEIGHT, BRAND_OG_IMAGE_WIDTH } from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
import { PostHogProvider } from '@/lib/posthog/provider'
import { CookieConsent } from '@/components/CookieConsent'
import { ThemeScriptSuppressor } from '@/components/ThemeScriptSuppressor'

const metadataBase = resolveMetadataBase()
/** Crawlers (WhatsApp, X) suelen exigir URL absoluta y sin caracteres problemáticos en la ruta. */
const openGraphImageAbsoluteUrl = new URL(BRAND_OG_IMAGE, metadataBase).href

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  display: 'swap',
})

// White-label v2 — fuentes curadas (Pro+, decisión CEO 2026-06-21). preload:false es CRÍTICO:
// el browser solo descarga la woff2 cuya font-family se usa (sin 10 <link rel=preload> degradando
// el LCP). Cada una expone --font-brand-<key>; el coach las activa por brand_font_key (enum cerrado).
const plusJakarta = Plus_Jakarta_Sans({ variable: '--font-brand-plus-jakarta', subsets: ['latin'], display: 'swap', preload: false })
const hanken = Hanken_Grotesk({ variable: '--font-brand-hanken', subsets: ['latin'], display: 'swap', preload: false })
const manrope = Manrope({ variable: '--font-brand-manrope', subsets: ['latin'], display: 'swap', preload: false })
const poppins = Poppins({ variable: '--font-brand-poppins', subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '500', '600', '700'] })
const sora = Sora({ variable: '--font-brand-sora', subsets: ['latin'], display: 'swap', preload: false })
const spaceGrotesk = Space_Grotesk({ variable: '--font-brand-space-grotesk', subsets: ['latin'], display: 'swap', preload: false })
const outfit = Outfit({ variable: '--font-brand-outfit', subsets: ['latin'], display: 'swap', preload: false })
const figtree = Figtree({ variable: '--font-brand-figtree', subsets: ['latin'], display: 'swap', preload: false })
const dmSans = DM_Sans({ variable: '--font-brand-dm-sans', subsets: ['latin'], display: 'swap', preload: false })
const lexend = Lexend({ variable: '--font-brand-lexend', subsets: ['latin'], display: 'swap', preload: false })
const BRAND_FONT_VARS = [plusJakarta, hanken, manrope, poppins, sora, spaceGrotesk, outfit, figtree, dmSans, lexend]
  .map((f) => f.variable)
  .join(' ')

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'EVA | Escala tu Negocio de Personal Training y Coaching',
    template: '%s | EVA',
  },
  description: 'EVA: plataforma SaaS para Personal Trainers y Coaches. Crea rutinas, planes de nutrición, gestiona alumnos y lanza tu app móvil white-label. Prueba gratis.',
  keywords: ['fitness', 'coaching', 'entrenamiento', 'SaaS', 'personal trainer', 'gym', 'rutinas', 'nutrición', 'white label', 'software entrenadores'],
  authors: [{ name: 'EVA' }],
  applicationName: 'EVA',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EVA',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'EVA | La plataforma definitiva para Personal Trainers',
    description: 'Transforma y escala tu negocio de fitness. Herramientas premium para crear rutinas, asignar planes de nutrición y llevar el control de tus alumnos en tu propia app white-label.',
    url: metadataBase.href.endsWith('/')
      ? metadataBase.href.slice(0, -1)
      : metadataBase.href,
    siteName: 'EVA',
    images: [
      {
        url: openGraphImageAbsoluteUrl,
        width: BRAND_OG_IMAGE_WIDTH,
        height: BRAND_OG_IMAGE_HEIGHT,
        alt: 'EVA',
        type: 'image/png',
      },
    ],
    locale: 'es_CL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EVA | Escala tu Negocio de Fitness',
    description: 'Rutinas, nutrición y app propia. Todo lo que necesitas para profesionalizar tu servicio de coaching.',
    images: [openGraphImageAbsoluteUrl],
  },
  metadataBase,
  manifest: '/api/manifest/default',
  // Favicon / app icons via Next file convention: app/favicon.ico + app/icon.png + app/apple-icon.png
  // (símbolo EVA blanco sólido sobre cuadrado negro). Sin bloque metadata.icons: la convención emite
  // los <link rel="icon|apple-touch-icon"> correctos y evita apuntar al outline tenue (BRAND_APP_ICON).
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${inter.variable} ${montserrat.variable} ${BRAND_FONT_VARS} antialiased`} suppressHydrationWarning>
        <PostHogProvider>
          <ThemeScriptSuppressor />
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange={false}
          >
            <LanguageProvider>
              <PwaRegister />
              <ScrollRestoration />
              <InstallPrompt brandName="EVA" />
              {children}
              <CookieConsent />
              <Toaster richColors position="bottom-center" />
              <Analytics debug={false} />
              <SpeedInsights debug={false} />
            </LanguageProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
