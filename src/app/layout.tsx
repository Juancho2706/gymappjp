import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PwaRegister } from '@/components/PwaRegister'
import { ScrollRestoration } from '@/components/ScrollRestoration'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_APP_ICON, BRAND_OG_IMAGE, BRAND_OG_IMAGE_HEIGHT, BRAND_OG_IMAGE_WIDTH } from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'

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
  description: 'EVA es la plataforma definitiva para Personal Trainers y Coaches. Crea rutinas profesionales, planes de nutrición, gestiona alumnos, automatiza check-ins y ten tu propia app móvil white-label.',
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
    locale: 'es_ES',
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
  icons: {
    icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
    apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${montserrat.variable} antialiased`} suppressHydrationWarning>
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
            <Toaster richColors position="bottom-center" />
            <Analytics />
            <SpeedInsights />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
