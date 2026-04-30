'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Apple, ChevronRight, BookOpen, Users, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  hasClients: boolean
  onAssign?: () => void
}

const STEPS = [
  {
    number: 1,
    icon: Apple,
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-500/10',
    title: 'Agrega tus alimentos',
    description:
      'Busca en el catálogo (~250 alimentos chilenos y globales) o crea los tuyos propios. Los alimentos son la base de todos tus planes.',
    cta: 'Ir al catálogo',
    href: '/coach/foods',
    external: false,
  },
  {
    number: 2,
    icon: BookOpen,
    iconColor: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    title: 'Crea tu primera plantilla',
    description:
      'Una plantilla es un modelo de plan reutilizable. Arma las comidas con sus alimentos y cantidades. Tarda menos de 5 minutos.',
    cta: 'Crear plantilla',
    href: '/coach/nutrition-plans/new',
    external: false,
  },
  {
    number: 3,
    icon: Users,
    iconColor: 'text-sky-500',
    iconBg: 'bg-sky-500/10',
    title: 'Asigna el plan a un alumno',
    description:
      'Una vez tengas una plantilla lista, asígnala a tus alumnos. Puedes asignar la misma plantilla a varios a la vez.',
    cta: 'Asignar plan',
    href: null,
    external: false,
  },
] as const

export function NutritionOnboarding({ hasClients, onAssign }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-card p-6 space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🥗</span>
          <h2 className="text-xl font-black uppercase tracking-tighter text-foreground">
            Bienvenido al módulo de nutrición
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-xl">
          Sigue estos 3 pasos para empezar a asignar planes nutricionales a tus alumnos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon
          const isDisabled = step.number === 3 && !hasClients
          return (
            <div
              key={step.number}
              className={cn(
                'relative rounded-xl border p-4 space-y-3 transition-colors',
                isDisabled
                  ? 'border-border/40 bg-muted/20 opacity-50'
                  : 'border-border bg-background hover:bg-muted/30'
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black',
                    step.iconBg,
                    step.iconColor
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Paso {step.number}
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-foreground">{step.title}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
              {step.number === 3 ? (
                <button
                  type="button"
                  disabled={isDisabled || !onAssign}
                  onClick={onAssign}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-bold transition-colors',
                    isDisabled || !onAssign
                      ? 'cursor-not-allowed text-muted-foreground'
                      : 'text-sky-600 hover:text-sky-700 dark:text-sky-400'
                  )}
                >
                  {step.cta}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Link
                  href={step.href!}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-bold transition-colors',
                    step.number === 1
                      ? 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400'
                      : 'text-violet-600 hover:text-violet-700 dark:text-violet-400'
                  )}
                >
                  {step.cta}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {!hasClients && 'Necesitas al menos un alumno para el paso 3.'}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Check className="h-3 w-3" />
          Entendido, ocultar
        </button>
      </div>
    </div>
  )
}
