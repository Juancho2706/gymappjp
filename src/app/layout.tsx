import type { Metadata, Viewport } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { PwaRegister } from '@/components/PwaRegister'
import { ScrollRestoration } from '@/components/ScrollRestoration'
import InstallPrompt from '@/components/InstallPrompt'

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
    default: 'COACH OP | Escala tu Negocio de Personal Training y Coaching',
    template: '%s | COACH OP',
  },
  description: 'COACH OP es la plataforma definitiva para Personal Trainers y Coaches. Crea rutinas profesionales, planes de nutrición, gestiona alumnos, automatiza check-ins y ten tu propia app móvil white-label.',
  keywords: ['fitness', 'coaching', 'entrenamiento', 'SaaS', 'personal trainer', 'gym', 'rutinas', 'nutrición', 'white label', 'software entrenadores'],
  authors: [{ name: 'COACH OP' }],
  applicationName: 'COACH OP',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'COACH OP',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'COACH OP | La plataforma definitiva para Personal Trainers',
    description: 'Transforma y escala tu negocio de fitness. Herramientas premium para crear rutinas, asignar planes de nutrición y llevar el control de tus alumnos en tu propia app white-label.',
    url: 'https://coachop.app',
    siteName: 'COACH OP',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'COACH OP Dashboard',
      },
    ],
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'COACH OP | Escala tu Negocio de Fitness',
    description: 'Rutinas, nutrición y app propia. Todo lo que necesitas para profesionalizar tu servicio de coaching.',
    images: ['/og-image.jpg'],
  },
  metadataBase: new URL('https://coachop.app'),
  manifest: '/api/manifest/default',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
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
            <InstallPrompt brandName="COACH OP" />
            {children}
            <Toaster richColors position="top-right" />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
