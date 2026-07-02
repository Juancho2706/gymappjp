'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Droplets, Footprints, Moon, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { upsertDailyHabits, getDailyHabits } from '@/app/c/[coach_slug]/nutrition/_actions/habits.actions'

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

// Kit alumno-dashboard.jsx:488-531 — WATER target 3 L, SLEEP 7 opciones full-width.
const WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]
const WATER_TARGET_ML = 3000
const SLEEP_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9]
// Ayuno/Suplementos se muestran como 2 toggles (kit): reusan la MISMA server action.
// Ayuno on = 16h (default), off = null. Suplementos on preserva el array si ya existe,
// si no marca un genérico; off limpia. El detalle fino sigue en la pantalla de Nutrición.
const FASTING_DEFAULT_H = 16
const SUPPLEMENTS_GENERIC = 'Suplementos'

export function HabitsCard({ clientId, coachSlug, logDate, isToday, initialData }: Props) {
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
        const { success, error } = await upsertDailyHabits({ clientId, logDate, coachSlug, ...next })
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

  const toggleFasting = () => {
    const next = fastingHours && fastingHours > 0 ? null : FASTING_DEFAULT_H
    setFastingHours(next)
    save({ fasting_hours: next })
  }

  const toggleSupps = () => {
    const next = supplements.length > 0 ? [] : [SUPPLEMENTS_GENERIC]
    setSupplements(next)
    save({ supplements: next })
  }

  const handleStepsBlur = () => {
    const v = parseInt(stepsInput, 10)
    const next = isNaN(v) || v < 0 ? null : v
    setSteps(next)
    save({ steps: next })
  }

  const waterL = (waterMl ?? 0) / 1000
  const fastingOn = !!fastingHours && fastingHours > 0
  const suppsOn = supplements.length > 0

  const toggles: Array<{ label: string; on: boolean; onClick: () => void }> = [
    { label: fastingOn ? `Ayuno ${fastingHours}h` : 'Ayuno', on: fastingOn, onClick: toggleFasting },
    { label: 'Suplementos', on: suppsOn, onClick: toggleSupps },
  ]

  return (
    <div className="flex flex-col gap-4 rounded-card border border-subtle bg-surface-card p-4 shadow-sm">
      {/* Agua — barra de progreso + chips de quick-add */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-strong">
            <Droplets className="h-[15px] w-[15px] text-aqua-700" /> Agua
          </span>
          <span className="text-[12.5px] font-bold tabular-nums text-muted">
            <span className="text-aqua-700">{waterL.toFixed(waterL % 1 ? 1 : 0)}</span> / 3 L
          </span>
        </div>
        <div className="mb-2.5 h-2 overflow-hidden rounded-pill bg-surface-sunken">
          <div
            className="h-full rounded-pill bg-[var(--aqua-700)] transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]"
            style={{ width: `${Math.min(100, ((waterMl ?? 0) / WATER_TARGET_ML) * 100)}%` }}
          />
        </div>
        <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
          {WATER_OPTIONS.map((v) => {
            const on = (waterMl ?? 0) >= v
            return (
              <button
                key={v}
                type="button"
                disabled={!isToday || isPending}
                onClick={() => handleWater(v)}
                className={cn(
                  'shrink-0 rounded-pill border-[1.5px] px-2.5 py-1.5 text-[12px] font-bold transition-colors',
                  on
                    ? 'border-aqua-700 bg-aqua-100 text-aqua-700'
                    : 'border-subtle bg-transparent text-subtle'
                )}
              >
                {v < 1000 ? v : `${v / 1000}L`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Pasos — input mono */}
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-strong">
          <Footprints className="h-[15px] w-[15px] text-sport-600" /> Pasos
        </div>
        <input
          value={stepsInput}
          onChange={(e) => setStepsInput(e.target.value.replace(/\D/g, ''))}
          onBlur={handleStepsBlur}
          inputMode="numeric"
          disabled={!isToday || isPending}
          placeholder="Ej: 8000"
          className="h-[42px] w-full rounded-control border-[1.5px] border-subtle bg-surface-sunken px-3 font-mono text-sm font-bold text-strong outline-none placeholder:text-subtle disabled:opacity-50"
        />
      </div>

      {/* Sueño — fila full-width, 7 opciones flex-1 */}
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-strong">
          <Moon className="h-[14px] w-[14px] text-muted" /> Sueño <span className="font-semibold text-subtle">· horas</span>
        </div>
        <div className="flex gap-1.5">
          {SLEEP_OPTIONS.map((v) => {
            const on = sleepHours === v
            return (
              <button
                key={v}
                type="button"
                disabled={!isToday || isPending}
                onClick={() => handleSleep(v)}
                className={cn(
                  'flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-control border-[1.5px] text-[12.5px] font-bold transition-colors',
                  on ? 'border-sport-500 bg-sport-100 text-sport-600' : 'border-subtle bg-transparent text-subtle'
                )}
              >
                {v}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ayuno + Suplementos — 2 toggles */}
      <div className="flex gap-2.5">
        {toggles.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={!isToday || isPending}
            onClick={t.onClick}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-control border-[1.5px] px-3 py-2.5 transition-colors',
              t.on ? 'border-sport-500 bg-sport-100' : 'border-subtle bg-transparent'
            )}
          >
            <span
              className={cn(
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-white',
                t.on ? 'bg-sport-500' : 'border-2 border-strong'
              )}
            >
              {t.on && <Check className="h-[13px] w-[13px]" />}
            </span>
            <span className={cn('text-[12.5px] font-bold', t.on ? 'text-strong' : 'text-muted')}>{t.label}</span>
          </button>
        ))}
      </div>

      {!isToday && <p className="text-center text-[10px] text-subtle">Solo se puede editar el día de hoy</p>}
    </div>
  )
}
