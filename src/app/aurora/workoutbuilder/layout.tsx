import type { Metadata } from 'next'
import { Inter_Tight } from 'next/font/google'

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Aurora · Creador de planes',
  description: 'Preview Aurora del planificador semanal (WeeklyPlanBuilder), móvil y desktop.',
}

export default function AuroraWorkoutBuilderLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${interTight.variable} min-h-dvh`}>{children}</div>
}
