'use client'

import { useMemo, useState, useTransition } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { NutrientRangeBar } from '@/components/nutrition/NutrientRangeBar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { NutrientTargetRow } from '@/services/nutrient-targets.service'
import { upsertClientNutrientTarget } from './_actions/nutrient-targets.actions'

/**
 * Zona C (coach) · Editor de umbrales de micronutrientes — feature A-base.
 * Define piso/meta/techo por nutriente para ESTE alumno; persiste vía la server
 * action coach-scoped (coach_id sale de la sesión, RLS hace cumplir coach↔alumno).
 *
 * Base tier: dos nutrientes canónicos —
 *   - sodio (cap)  → techo a no superar
 *   - fibra (aimup) → meta a alcanzar
 *
 * Color nunca es señal única (NutrientRangeBar añade palabra + ícono + posición).
 */

type NutrientIntent = 'aimup' | 'cap'

type NutrientDef = {
  key: string
  label: string
  unit: string
  intent: NutrientIntent
  /** Campos relevantes según el intent. */
  fields: ('floor' | 'target' | 'ceiling')[]
  /** Valor de ejemplo para el preview de la barra. */
  previewValue: number
  hint: string
}

/** Catálogo base (A). Disponible para todos los coaches. */
const BASE_NUTRIENTS: NutrientDef[] = [
  {
    key: 'sodium_mg',
    label: 'Sodio',
    unit: 'mg',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    previewValue: 1500,
    hint: 'Tope diario sugerido ~2300 mg. Define el techo a no superar.',
  },
  {
    key: 'fiber_g',
    label: 'Fibra',
    unit: 'g',
    intent: 'aimup',
    fields: ['floor', 'target'],
    previewValue: 18,
    hint: 'Meta diaria sugerida 25–30 g. Define el piso/meta a alcanzar.',
  },
]

/** Catálogo avanzado — solo cuando "Nutrición Pro" (nutrition_exchanges) está ON. */
const PRO_NUTRIENTS: NutrientDef[] = [
  {
    key: 'sugar_g',
    label: 'Azúcar',
    unit: 'g',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    previewValue: 30,
    hint: 'Tope diario sugerido < 50 g (azúcares añadidos). Define el techo a no superar.',
  },
  {
    key: 'saturated_fat_g',
    label: 'Grasa saturada',
    unit: 'g',
    intent: 'cap',
    fields: ['target', 'ceiling'],
    previewValue: 15,
    hint: 'Tope diario sugerido < 10% de las kcal. Define el techo a no superar.',
  },
  {
    key: 'unsaturated_fat_g',
    label: 'Grasa insaturada',
    unit: 'g',
    intent: 'aimup',
    fields: ['floor', 'target'],
    previewValue: 25,
    hint: 'Prioriza grasas insaturadas (mono/poli). Define el piso/meta a alcanzar.',
  },
]

type Draft = {
  floor: string
  target: string
  ceiling: string
}

function rowToDraft(row?: NutrientTargetRow): Draft {
  return {
    floor: row?.floor_value != null ? String(row.floor_value) : '',
    target: row?.target_value != null ? String(row.target_value) : '',
    ceiling: row?.ceiling_value != null ? String(row.ceiling_value) : '',
  }
}

function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export type CoachNutrientTargetsEditorProps = {
  clientId: string
  /** Targets ya guardados para este alumno (incluye defaults del coach). */
  initial: NutrientTargetRow[]
  /**
   * "Nutrición Pro" (módulo nutrition_exchanges) ON ⇒ permite definir umbrales para
   * los nutrientes avanzados (azúcar, grasas). Resuelto SERVER-SIDE. Default `false`.
   */
  proEnabled?: boolean
}

export function CoachNutrientTargetsEditor({
  clientId,
  initial,
  proEnabled = false,
}: CoachNutrientTargetsEditorProps) {
  const reduceMotion = useReducedMotion()
  const nutrients = useMemo(
    () => (proEnabled ? [...BASE_NUTRIENTS, ...PRO_NUTRIENTS] : BASE_NUTRIENTS),
    [proEnabled]
  )

  const initialByKey = useMemo(() => {
    const map = new Map<string, NutrientTargetRow>()
    for (const row of initial) {
      // Prioriza la fila específica del alumno por sobre el default del coach.
      const existing = map.get(row.nutrient_key)
      if (!existing || (row.client_id === clientId && existing.client_id !== clientId)) {
        map.set(row.nutrient_key, row)
      }
    }
    return map
  }, [initial, clientId])

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {}
    for (const n of [...BASE_NUTRIENTS, ...PRO_NUTRIENTS]) {
      out[n.key] = rowToDraft(initialByKey.get(n.key))
    }
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const setField = (key: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const handleSave = (n: NutrientDef) => {
    const draft = drafts[n.key]
    const floorValue = n.fields.includes('floor') ? parseNum(draft.floor) : null
    const targetValue = n.fields.includes('target') ? parseNum(draft.target) : null
    const ceilingValue = n.fields.includes('ceiling') ? parseNum(draft.ceiling) : null

    if (floorValue == null && targetValue == null && ceilingValue == null) {
      toast.error('Define al menos un umbral.')
      return
    }

    setSavingKey(n.key)
    startTransition(async () => {
      const res = await upsertClientNutrientTarget({
        clientId,
        nutrientKey: n.key,
        floorValue,
        targetValue,
        ceilingValue,
        intent: n.intent,
        provenance: 'manual',
      })
      setSavingKey(null)
      if (res.ok) {
        toast.success(`${n.label}: umbral guardado.`)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-1.5">
        <h3 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
          Umbrales de micronutrientes
        </h3>
        <InfoTooltip content="Define topes/metas de micros para este alumno — base." />
      </div>

      <div className="space-y-6">
        {nutrients.map((n, idx) => {
          const draft = drafts[n.key]
          const floor = n.fields.includes('floor') ? parseNum(draft.floor) : null
          const target = n.fields.includes('target') ? parseNum(draft.target) : null
          const ceiling = n.fields.includes('ceiling') ? parseNum(draft.ceiling) : null
          const isSaving = savingKey === n.key

          return (
            <motion.div
              key={n.key}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : idx * 0.05 }}
              className="space-y-3 rounded-control border border-subtle bg-surface-sunken p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black uppercase tracking-widest text-foreground">
                    {n.label}
                  </span>
                  <span
                    className={cn(
                      'rounded-control px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest',
                      n.intent === 'cap'
                        ? 'bg-[var(--warning-100)] text-[var(--warning-700)]'
                        : 'bg-[var(--success-100)] text-[var(--success-700)]'
                    )}
                  >
                    {n.intent === 'cap' ? 'Tope' : 'Meta'}
                  </span>
                  <InfoTooltip content={n.hint} iconClassName="w-3 h-3" />
                </div>
              </div>

              {/* Preview redundante (color + palabra + ícono + posición). */}
              <NutrientRangeBar
                label={`Ejemplo (${n.previewValue} ${n.unit})`}
                value={n.previewValue}
                unit={n.unit}
                floor={floor ?? undefined}
                target={target ?? undefined}
                ceiling={ceiling ?? undefined}
                intent={n.intent}
              />

              <div className="grid grid-cols-3 gap-3">
                {(['floor', 'target', 'ceiling'] as const).map((field) => {
                  const enabled = n.fields.includes(field)
                  const fieldLabel =
                    field === 'floor' ? 'Piso' : field === 'target' ? 'Meta' : 'Techo'
                  const inputId = `${n.key}-${field}`
                  return (
                    <div key={field} className={cn('space-y-1', !enabled && 'opacity-40')}>
                      <Label
                        htmlFor={inputId}
                        className="text-[9px] font-black uppercase tracking-widest text-muted-foreground"
                      >
                        {fieldLabel}
                      </Label>
                      <Input
                        id={inputId}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        disabled={!enabled || isSaving}
                        value={draft[field]}
                        onChange={(e) => setField(n.key, field, e.target.value)}
                        placeholder={enabled ? n.unit : '—'}
                        className="h-11 tabular-nums"
                      />
                    </div>
                  )
                })}
              </div>

              <Button
                type="button"
                size="sm"
                className="h-11 w-full gap-1.5 font-black uppercase tracking-widest sm:w-auto sm:px-6"
                disabled={isSaving}
                onClick={() => handleSave(n)}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? 'Guardando…' : 'Guardar'}
              </Button>
            </motion.div>
          )
        })}
      </div>
      {!proEnabled && (
        <p className="mt-4 text-[10px] leading-snug text-muted-foreground/70">
          Nutrición Pro desbloquea umbrales para más micros (azúcar, grasas).
        </p>
      )}
    </Card>
  )
}
