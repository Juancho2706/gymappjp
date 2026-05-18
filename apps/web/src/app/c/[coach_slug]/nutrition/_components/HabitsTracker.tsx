'use client'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { Droplets, Footprints, Moon, Timer, Pill, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { upsertDailyHabits, getDailyHabits } from '../_actions/habits.actions'
import { toast } from 'sonner'
import { InfoTooltip } from '@/components/ui/info-tooltip'

interface HabitsData {
  water_ml: number | null
  steps: number | null
  sleep_hours: number | null
  fasting_hours: number | null
  supplements: string[] | null
  notes: string | null
}

interface Props {
  clientId: string
  coachSlug: string
  logDate: string
  isToday: boolean
  initialData?: HabitsData | null
}

const WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]
const SLEEP_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const FASTING_OPTIONS = [12, 14, 16, 18, 20, 24]
const SUPPLEMENT_OPTIONS = [
  'Creatina', 'Proteína', 'Omega-3', 'Vitamina D',
  'Multivit.', 'Magnesio', 'Zinc', 'Cafeína', 'BCAA',
]

function SectionHeader({
  icon,
  label,
  colorClass,
}: {
  icon: React.ReactNode
  label: string
  colorClass: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', colorClass)}>
        {icon}
      </span>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

export function HabitsTracker({ clientId, coachSlug, logDate, isToday, initialData }: Props) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [data, setData] = useState<HabitsData | null>(initialData ?? null)
  const [waterMl, setWaterMl] = useState<number | null>(initialData?.water_ml ?? null)
  const [steps, setSteps] = useState<number | null>(initialData?.steps ?? null)
  const [sleepHours, setSleepHours] = useState<number | null>(initialData?.sleep_hours ?? null)
  const [fastingHours, setFastingHours] = useState<number | null>(initialData?.fasting_hours ?? null)
  const [supplements, setSupplements] = useState<string[]>(initialData?.supplements ?? [])
  const [stepsInput, setStepsInput] = useState(initialData?.steps != null ? String(initialData.steps) : '')

  useEffect(() => {
    getDailyHabits(clientId, logDate).then((d) => {
      setData(d)
      setWaterMl(d?.water_ml ?? null)
      setSteps(d?.steps ?? null)
      setSleepHours(d?.sleep_hours ?? null)
      setFastingHours(d?.fasting_hours ?? null)
      setSupplements(d?.supplements ?? [])
      setStepsInput(d?.steps != null ? String(d.steps) : '')
    })
  }, [clientId, logDate])

  const save = useCallback(
    (patch: Partial<HabitsData>) => {
      if (!isToday) return
      const next = {
        waterMl: patch.water_ml !== undefined ? patch.water_ml : waterMl,
        steps: patch.steps !== undefined ? patch.steps : steps,
        sleepHours: patch.sleep_hours !== undefined ? patch.sleep_hours : sleepHours,
        fastingHours: patch.fasting_hours !== undefined ? patch.fasting_hours : fastingHours,
        supplements: patch.supplements !== undefined ? (patch.supplements as string[]) : supplements,
        notes: patch.notes !== undefined ? patch.notes : (data?.notes ?? null),
      }
      startTransition(async () => {
        const { success, error } = await upsertDailyHabits({
          clientId,
          logDate,
          coachSlug,
          ...next,
        })
        if (!success) toast.error(error ?? 'Error al guardar hábitos')
      })
    },
    [clientId, logDate, coachSlug, isToday, waterMl, steps, sleepHours, fastingHours, supplements, data]
  )

  const handleWater = (ml: number) => {
    const next = waterMl === ml ? null : ml
    setWaterMl(next)
    save({ water_ml: next })
  }

  const handleSleep = (h: number) => {
    const next = sleepHours === h ? null : h
    setSleepHours(next)
    save({ sleep_hours: next })
  }

  const handleFasting = (h: number) => {
    const next = fastingHours === h ? null : h
    setFastingHours(next)
    save({ fasting_hours: next })
  }

  const handleSupplement = (name: string) => {
    const next = supplements.includes(name)
      ? supplements.filter((s) => s !== name)
      : [...supplements, name]
    setSupplements(next)
    save({ supplements: next })
  }

  const handleStepsBlur = () => {
    const v = parseInt(stepsInput, 10)
    const next = isNaN(v) || v < 0 ? null : v
    setSteps(next)
    save({ steps: next })
  }

  const hasSupplements = supplements.length > 0
  const filled = [waterMl, steps, sleepHours, fastingHours, hasSupplements || null].filter((v) => v != null).length
  const total = 5

  return (
    <div className={cn(
      'rounded-2xl border transition-colors',
      filled > 0 ? 'border-sky-500/20 bg-sky-500/[0.03]' : 'border-border bg-card'
    )}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 select-none"
      >
        <Droplets className={cn('h-4 w-4 shrink-0', filled > 0 ? 'text-sky-500' : 'text-muted-foreground/50')} />
        <div className="flex-1 text-left">
          <p className={cn(
            'flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-widest',
            filled > 0 ? 'text-sky-500' : 'text-muted-foreground/60'
          )}>
            <span>Hábitos del día</span>
            <InfoTooltip
              title="Hábitos opcionales"
              content="Agua, pasos, sueño, ayuno y suplementos sirven de contexto para tu coach. Son orientativos y no reemplazan valoración clínica."
              className="normal-case tracking-normal"
            />
          </p>
          {filled > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
              {[
                waterMl != null && `${(waterMl / 1000).toFixed(1).replace('.0', '')}L agua`,
                steps != null && `${steps.toLocaleString()} pasos`,
                sleepHours != null && `${sleepHours}h sueño`,
                fastingHours != null && `${fastingHours}h ayuno`,
                supplements.length > 0 && `${supplements.length} supl.`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {filled > 0 && (
            <span className="text-[10px] font-bold text-sky-500">{filled}/{total}</span>
          )}
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

              {/* Agua */}
              <div className="space-y-2">
                <SectionHeader
                  icon={<Droplets className="h-3 w-3 text-sky-500" />}
                  label={`Agua${waterMl != null ? ` · ${(waterMl / 1000).toFixed(1).replace('.0', '')}L` : ''}`}
                  colorClass="bg-sky-500/10"
                />
                <div className="flex flex-wrap gap-1.5">
                  {WATER_OPTIONS.map((ml) => (
                    <button
                      key={ml}
                      type="button"
                      disabled={!isToday || isPending}
                      onClick={() => handleWater(ml)}
                      className={cn(
                        'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all touch-manipulation',
                        waterMl === ml
                          ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                          : 'bg-background border border-border/80 text-foreground hover:border-sky-500/40 hover:bg-sky-500/5'
                      )}
                    >
                      {ml < 1000 ? `${ml}ml` : `${ml / 1000}L`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pasos */}
              <div className="space-y-2">
                <SectionHeader
                  icon={<Footprints className="h-3 w-3 text-emerald-500" />}
                  label="Pasos"
                  colorClass="bg-emerald-500/10"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!isToday || isPending}
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value.replace(/\D/g, ''))}
                    onBlur={handleStepsBlur}
                    placeholder="Ej: 8000"
                    className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
                  />
                  {steps != null && (
                    <span className={cn(
                      'rounded-lg px-2 py-1 text-[10px] font-bold',
                      steps >= 10000 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : steps >= 8000 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : steps >= 5000 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
                    )}>
                      {steps >= 10000 ? '🏆 Meta!' : steps >= 8000 ? '✓ Buen día' : steps >= 5000 ? 'En progreso' : 'Poco activo'}
                    </span>
                  )}
                </div>
              </div>

              {/* Sueño */}
              <div className="space-y-2">
                <SectionHeader
                  icon={<Moon className="h-3 w-3 text-violet-500" />}
                  label={`Sueño${sleepHours != null ? ` · ${sleepHours}h` : ''}`}
                  colorClass="bg-violet-500/10"
                />
                <div className="flex flex-wrap gap-1.5">
                  {SLEEP_OPTIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={!isToday || isPending}
                      onClick={() => handleSleep(h)}
                      className={cn(
                        'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all touch-manipulation',
                        sleepHours === h
                          ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/30'
                          : 'bg-background border border-border/80 text-foreground hover:border-violet-500/40 hover:bg-violet-500/5'
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Ayuno intermitente */}
              <div className="space-y-2">
                <SectionHeader
                  icon={<Timer className="h-3 w-3 text-orange-500" />}
                  label={`Ayuno${fastingHours != null ? ` · ${fastingHours}h` : ''}`}
                  colorClass="bg-orange-500/10"
                />
                <div className="flex flex-wrap gap-1.5">
                  {FASTING_OPTIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={!isToday || isPending}
                      onClick={() => handleFasting(h)}
                      className={cn(
                        'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all touch-manipulation',
                        fastingHours === h
                          ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                          : 'bg-background border border-border/80 text-foreground hover:border-orange-500/40 hover:bg-orange-500/5'
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Suplementos */}
              <div className="space-y-2">
                <SectionHeader
                  icon={<Pill className="h-3 w-3 text-rose-500" />}
                  label={`Suplementos${supplements.length > 0 ? ` · ${supplements.length}` : ''}`}
                  colorClass="bg-rose-500/10"
                />
                <div className="flex flex-wrap gap-1.5">
                  {SUPPLEMENT_OPTIONS.map((name) => {
                    const active = supplements.includes(name)
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={!isToday || isPending}
                        onClick={() => handleSupplement(name)}
                        className={cn(
                          'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all touch-manipulation',
                          active
                            ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/30'
                            : 'bg-background border border-border/80 text-foreground hover:border-rose-500/40 hover:bg-rose-500/5'
                        )}
                      >
                        {active && <Check className="h-2.5 w-2.5" />}
                        {name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {!isToday && (
                <p className="text-[10px] text-muted-foreground/50 text-center">Solo se puede editar el día de hoy</p>
              )}

              {isPending && (
                <div className="flex items-center justify-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                  <p className="text-[10px] text-sky-500">Guardando…</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
