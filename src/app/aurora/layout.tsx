import type { Metadata } from 'next'
import { Inter_Tight } from 'next/font/google'

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Aurora · Rediseño EVA',
  description:
    'Estudio de marca liquid glass: dashboards coach y alumno, Mi marca y creador de planes (claro / oscuro).',
}

export default function AuroraLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${interTight.variable} min-h-dvh`}>{children}</div>
}
