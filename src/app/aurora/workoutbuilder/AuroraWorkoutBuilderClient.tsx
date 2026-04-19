'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Moon, Sun } from 'lucide-react'
import { AuroraCoachColorControls } from '@/app/aurora/components/AuroraCoachColorControls'
import { coachSecondaryForTheme, hexToRgbString } from '@/app/aurora/lib/aurora-brand'
import { cn } from '@/lib/utils'
import { AuroraWorkoutBuilderPreview } from './AuroraWorkoutBuilderPreview'
import '../aurora.css'

type PageTheme = 'light' | 'dark'

export default function AuroraWorkoutBuilderClient() {
  const [pageTheme, setPageTheme] = useState<PageTheme>('dark')
  const [coachPrimary, setCoachPrimary] = useState('#7B5CFF')

  const coachSecondary = useMemo(() => coachSecondaryForTheme(coachPrimary, pageTheme), [coachPrimary, pageTheme])

  const rootStyle = useMemo(
    () =>
      ({
        '--aurora-coach-primary': coachPrimary,
        '--aurora-coach-secondary': coachSecondary,
        '--aurora-coach-rgb': hexToRgbString(coachPrimary),
      }) as React.CSSProperties,
    [coachPrimary, coachSecondary]
  )

  return (
    <div className="aurora-root" data-page-theme={pageTheme} data-coach-brand="" style={rootStyle}>
      <nav className="aurora-toolbar" aria-label="Aurora workout builder">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/aurora">← Aurora</Link>
          <Link href="/" className="opacity-70 hover:opacity-100">
            EVA
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
            Creador de planes · preview
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <AuroraCoachColorControls value={coachPrimary} onChange={setCoachPrimary} pageTheme={pageTheme} />
          <button
            type="button"
            onClick={() => setPageTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="inline-flex shrink-0 items-center gap-2"
          >
            {pageTheme === 'dark' ? (
              <>
                <Sun size={16} strokeWidth={2} aria-hidden />
                Claro
              </>
            ) : (
              <>
                <Moon size={16} strokeWidth={2} aria-hidden />
                Oscuro
              </>
            )}
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <header className="mb-8 max-w-2xl">
          <h1
            className={cn(
              'mb-2 text-2xl font-bold tracking-tight [font-family:var(--font-inter-tight),system-ui,sans-serif]',
              pageTheme === 'light' ? 'text-[#0a0a14]' : 'text-[#f5f5fa]'
            )}
          >
            Creador de planes · Aurora
          </h1>
          <p
            className={cn(
              'text-sm leading-relaxed',
              pageTheme === 'light' ? 'text-[#4a4a58]' : 'text-[#a8a8b4]'
            )}
          >
            Réplica visual del <strong>WeeklyPlanBuilder</strong> (toolbar, fases, catálogo, columnas por día, bloques tipo{' '}
            <strong>ExerciseBlock</strong>). Elige color de marca y modo claro/oscuro como en el resto del showcase.
          </p>
        </header>
        <AuroraWorkoutBuilderPreview coachPrimary={coachPrimary} pageTheme={pageTheme} />
      </div>
    </div>
  )
}
