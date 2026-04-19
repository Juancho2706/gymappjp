'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Eye,
  GripVertical,
  LayoutTemplate,
  MoreVertical,
  Printer,
  Redo2,
  Save,
  Search,
  Settings,
  Undo2,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getMuscleColor } from '@/app/coach/builder/[clientId]/muscle-colors'
import { ProgramPhasesBar } from '@/components/shared/ProgramPhasesBar'
import { hexToRgbString } from '@/app/aurora/lib/aurora-brand'

type MockBlock = {
  id: string
  name: string
  muscle: string
  sets: number
  reps: string
  weight: string
}

type MockDay = {
  id: number
  name: string
  short: string
  blocks: MockBlock[]
}

const MOCK_DAYS: MockDay[] = [
  {
    id: 1,
    name: 'Lunes',
    short: 'Lun',
    blocks: [
      { id: 'b1', name: 'Press banca con barra', muscle: 'Pecho', sets: 4, reps: '8', weight: '60' },
      { id: 'b2', name: 'Aperturas con mancuernas', muscle: 'Pecho', sets: 3, reps: '12', weight: '14' },
      { id: 'b3', name: 'Elevaciones laterales', muscle: 'Hombros', sets: 4, reps: '15', weight: '8' },
    ],
  },
  {
    id: 2,
    name: 'Martes',
    short: 'Mar',
    blocks: [
      { id: 'b4', name: 'Dominadas asistidas', muscle: 'Espalda', sets: 4, reps: '8', weight: '—' },
      { id: 'b5', name: 'Remo con barra', muscle: 'Espalda', sets: 4, reps: '10', weight: '50' },
    ],
  },
  {
    id: 3,
    name: 'Miércoles',
    short: 'Mié',
    blocks: [{ id: 'b6', name: 'Descanso activo', muscle: 'Movilidad', sets: 1, reps: '20 min', weight: '—' }],
  },
]

const CATALOG = ['Press banca', 'Sentadilla', 'Peso muerto', 'Dominadas', 'Remo', 'Curl']

function ExerciseRow({ block }: { block: MockBlock }) {
  const muscleColor = getMuscleColor(block.muscle)
  return (
    <div
      className={cn(
        'group relative flex min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background/80 shadow-sm backdrop-blur-md transition-all dark:bg-card/50',
        'border-l-4 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md dark:hover:border-primary/40 dark:hover:bg-primary/10'
      )}
      style={{ borderLeftColor: muscleColor }}
    >
      <div className="flex min-w-0 items-center gap-3 p-3">
        <div
          className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab items-center justify-center rounded-lg p-1.5 text-muted-foreground md:min-h-0 md:min-w-0"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border"
          style={{ backgroundColor: `color-mix(in srgb, ${muscleColor} 18%, transparent)` }}
        />
        <div className="min-w-0 flex-1 cursor-default py-1">
          <div className="break-words text-xs font-bold uppercase leading-snug tracking-widest text-foreground [overflow-wrap:anywhere]">
            {block.name}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span>{block.sets}×{block.reps}</span>
            <span className="text-primary">·</span>
            <span>{block.weight} kg</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  className,
}: {
  day: MockDay
  className?: string
}) {
  const totalSets = day.blocks.reduce((s, b) => s + b.sets, 0)
  return (
    <div
      className={cn(
        'flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm backdrop-blur-xl dark:bg-card/80',
        'w-full min-w-[200px] max-w-full md:w-[300px] md:max-w-[300px] md:shrink-0',
        className
      )}
    >
      <div className="border-b border-border bg-muted/30 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {day.name}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{totalSets} series</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <div className="mb-1 rounded-lg border border-dashed border-border/80 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Principal · soltar
        </div>
        {day.blocks.map((b) => (
          <ExerciseRow key={b.id} block={b} />
        ))}
        <button
          type="button"
          className="w-full rounded-xl border border-dashed border-border py-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          + Añadir ejercicio
        </button>
      </div>
    </div>
  )
}

export function AuroraWorkoutBuilderPreview({
  coachPrimary,
  pageTheme,
}: {
  coachPrimary: string
  pageTheme: 'light' | 'dark'
}) {
  const [mobileDay, setMobileDay] = useState(1)
  const rgb = useMemo(() => hexToRgbString(coachPrimary), [coachPrimary])

  const phases = useMemo(
    () => [
      { name: 'Acumulación', weeks: 4, color: coachPrimary },
      { name: 'Intensificación', weeks: 3, color: mixWith(coachPrimary, pageTheme === 'dark' ? '#fff' : '#000', 0.25) },
    ],
    [coachPrimary, pageTheme]
  )

  const active = MOCK_DAYS.find((d) => d.id === mobileDay) ?? MOCK_DAYS[0]

  return (
    <div
      className={cn(pageTheme === 'dark' ? 'dark' : '')}
      style={
        {
          '--theme-primary': coachPrimary,
          '--theme-primary-rgb': rgb,
        } as React.CSSProperties
      }
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
        {/* Header — mismo layout que WeeklyPlanBuilder (toolbar) */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md dark:bg-background/95">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/aurora"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground md:hidden"
                aria-label="Volver a Aurora"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Plan semanal</p>
                <h1 className="truncate text-sm font-bold uppercase tracking-widest text-foreground md:text-base">
                  Fuerza · Joaquín Muñoz
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1 md:gap-2">
              <button
                type="button"
                className="hidden h-10 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 md:inline-flex"
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                Plantillas
              </button>
              <button
                type="button"
                className="hidden h-10 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 md:inline-flex"
              >
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </button>
              <button
                type="button"
                className="hidden h-10 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 md:inline-flex"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Balance
              </button>
              <button
                type="button"
                className="hidden h-10 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 md:inline-flex"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </button>
              <div className="hidden items-center gap-1 md:flex">
                <button type="button" className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5">
                  <Undo2 className="mx-auto h-4 w-4" />
                </button>
                <button type="button" className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5">
                  <Redo2 className="mx-auto h-4 w-4" />
                </button>
              </div>
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground md:hidden">
                <MoreVertical className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/40 text-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.25)] md:h-10 md:w-10"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-md md:h-10 md:px-6"
                style={{ backgroundColor: 'var(--theme-primary)', boxShadow: `0 0 20px rgba(${rgb},0.35)` }}
              >
                <Save className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Guardar</span>
              </button>
            </div>
          </div>
          <ProgramPhasesBar phases={phases} />
        </header>

        {/* Desktop: catálogo + columnas horizontales */}
        <div className="hidden min-h-[520px] flex-1 overflow-hidden md:flex">
          <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-background/50 backdrop-blur-sm">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  readOnly
                  placeholder="Buscar ejercicio…"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-xs"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Catálogo</p>
              {CATALOG.map((name) => (
                <div
                  key={name}
                  className="cursor-grab rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs font-semibold text-foreground"
                >
                  {name}
                </div>
              ))}
            </div>
          </aside>
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-secondary/30 p-4 dark:bg-background/80">
            <div className="flex h-full min-h-[480px] gap-4">
              {MOCK_DAYS.map((d) => (
                <DayColumn key={d.id} day={d} />
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: chips de día + una columna */}
        <div className="flex flex-col md:hidden">
          <div className="flex gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
            {MOCK_DAYS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setMobileDay(d.id)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest',
                  mobileDay === d.id
                    ? 'text-white shadow-md'
                    : 'bg-background text-muted-foreground'
                )}
                style={
                  mobileDay === d.id
                    ? { background: coachPrimary, boxShadow: `0 4px 14px ${coachPrimary}55` }
                    : undefined
                }
              >
                {d.short}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto bg-secondary/30 p-3 dark:bg-background/80">
            <DayColumn day={active} className="w-full" />
          </div>
        </div>

        <p className="border-t border-border px-4 py-2 text-center text-[10px] text-muted-foreground">
          Vista estática Aurora · mismo esquema que <code className="text-[10px]">WeeklyPlanBuilder</code> (sin DnD ni guardado).
        </p>
      </div>
    </div>
  )
}

function mixWith(hex: string, target: string, t: number): string {
  const a = parse(hex)
  const b = parse(target)
  if (!a || !b) return hex
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function parse(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}
