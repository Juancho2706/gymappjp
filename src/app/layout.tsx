import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const outfit = Outfit({
  variable: '--font-outfit',
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
    default: 'OmniCoach OS | Plataforma Todo-en-Uno para Entrenadores',
    template: '%s | OmniCoach OS',
  },
  description: 'La plataforma definitiva para coaches y personal trainers que quieren escalar su negocio. Crea rutinas, planes nutricionales, gestiona alumnos y ten tu propia app white-label.',
  keywords: ['fitness', 'coaching', 'entrenamiento', 'SaaS', 'personal trainer', 'gym', 'rutinas', 'nutrición', 'white label'],
  authors: [{ name: 'OmniCoach OS' }],
  applicationName: 'OmniCoach OS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'OmniCoach',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'OmniCoach OS | Plataforma Todo-en-Uno para Entrenadores',
    description: 'Escala tu negocio de fitness con herramientas profesionales para rutinas, nutrición y seguimiento de alumnos.',
    url: 'https://omnicoach.app',
    siteName: 'OmniCoach OS',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'OmniCoach OS Dashboard',
      },
    ],
    locale: 'es_ES',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OmniCoach OS | Plataforma Todo-en-Uno para Entrenadores',
    description: 'La plataforma definitiva para coaches que quieren escalar. Rutinas, nutrición y app propia.',
    images: ['/og-image.jpg'],
  },
  metadataBase: new URL('https://omnicoach.app'),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <link rel="manifest" href="/api/manifest/default" />
        <meta name="theme-color" content="#10B981" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OmniCoach" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={`${inter.variable} ${outfit.variable} antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <LanguageProvider>
            {children}
            <Toaster richColors position="top-right" />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
