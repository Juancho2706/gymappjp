'use client'

/**
 * Sección "Porciones a elección" (T1.1 — SPEC UX-a): vive DENTRO de cada card de
 * franja del paso Construcción, hermana de la lista de alimentos, debajo de
 * "+ Alimento". Fila por grupo: circulito 20 px con el código (color del grupo del
 * catálogo SOLO como identidad, letra blanca) + nombre + stepper 0,5 (adaptación
 * del patrón `StepperField` del quick-edit — copiado, no editado; nota de origen:
 * `../../_quick-edit/StepperField.tsx`, regla de archivos disjuntos) + eliminar.
 *
 * White-label: acciones y estados activos usan `primary` del coach; el hex del
 * grupo nunca colorea texto sobre superficie. Motion: NUTRITION_MOTION.press en
 * los targets táctiles. 360 px: el nombre trunca con ellipsis, el stepper tiene
 * ancho fijo y jamás se comprime.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { NUTRITION_MOTION } from '@eva/nutrition-v2'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { loadExchangeGroupsForBuilderAction } from './PortionsGroupsAction'
import { PortionsGroupDot } from './PortionsGroupDot'
import { PortionsGroupPicker } from './PortionsGroupPicker'
import {
  addPortionGroup,
  formatPortionsEs,
  parsePortionsInput,
  removePortionGroup,
  slotPortionTargets,
  sortGroupsForPicker,
  stepPortionValue,
  PORTIONS_MIN,
  type PortionsBySlot,
} from './portions-state'

/**
 * Controlador compartido del estado de porciones del builder: el mapa slot→targets,
 * el catálogo de grupos (carga perezosa con error/reintento — SPEC UX-c) y las
 * operaciones. Lo crea PlanBuilderClient (una instancia por wizard) y baja por
 * props a la sección de cada franja, la card de derivación (paso 1) y la revisión
 * (paso 3).
 */
export interface PortionsController {
  bySlot: PortionsBySlot
  groups: ExchangeGroup[] | null
  groupsLoading: boolean
  groupsError: string | null
  /** Carga el catálogo si aún no está (el picker la dispara al abrirse). */
  ensureGroupsLoaded: () => void
  /** Reintento explícito tras un error de carga. */
  retryGroups: () => void
  addGroup: (slotKey: string, exchangeGroupId: string) => void
  removeGroup: (slotKey: string, exchangeGroupId: string) => void
  step: (slotKey: string, exchangeGroupId: string, direction: 1 | -1) => void
  /** Commit de edición libre del stepper (acepta "1,5"); entradas inválidas se ignoran. */
  commitValue: (slotKey: string, exchangeGroupId: string, raw: string) => void
}

export function usePortionsBuilder(clientId: string): PortionsController {
  const [bySlot, setBySlot] = useState<PortionsBySlot>({})
  const [groups, setGroups] = useState<ExchangeGroup[] | null>(null)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setGroupsLoading(true)
    setGroupsError(null)
    const res = await loadExchangeGroupsForBuilderAction({ clientId })
    loadingRef.current = false
    setGroupsLoading(false)
    if (!res.ok) {
      setGroupsError(res.error)
      return
    }
    setGroups(sortGroupsForPicker(res.groups))
  }, [clientId])

  const ensureGroupsLoaded = useCallback(() => {
    if (groups == null && !loadingRef.current) void load()
  }, [groups, load])

  return {
    bySlot,
    groups,
    groupsLoading,
    groupsError,
    ensureGroupsLoaded,
    retryGroups: useCallback(() => void load(), [load]),
    addGroup: useCallback(
      (slotKey, exchangeGroupId) => setBySlot((prev) => addPortionGroup(prev, slotKey, exchangeGroupId)),
      [],
    ),
    removeGroup: useCallback(
      (slotKey, exchangeGroupId) => setBySlot((prev) => removePortionGroup(prev, slotKey, exchangeGroupId)),
      [],
    ),
    step: useCallback(
      (slotKey, exchangeGroupId, direction) =>
        setBySlot((prev) => stepPortionValue(prev, slotKey, exchangeGroupId, direction)),
      [],
    ),
    commitValue: useCallback((slotKey, exchangeGroupId, raw) => {
      const parsed = parsePortionsInput(raw)
      if (parsed == null) return
      setBySlot((prev) => {
        const current = slotPortionTargets(prev, slotKey)
        return {
          ...prev,
          [slotKey]: current.map((t) => (t.exchangeGroupId === exchangeGroupId ? { ...t, portions: parsed } : t)),
        }
      })
    }, []),
  }
}

const stepButtonClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border-default bg-surface-card text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

/**
 * Stepper 0,5 tap-to-edit, adaptación del patrón `StepperField` del quick-edit
 * (copiado a este directorio; el original no se edita). Ancho FIJO: nunca se
 * comprime en 360 px (el nombre del grupo es quien trunca). Coma decimal es-CL.
 */
function PortionsStepper({
  label,
  value,
  onStep,
  onCommit,
}: {
  label: string
  value: number
  onStep: (direction: 1 | -1) => void
  onCommit: (raw: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const whileTap = reduceMotion ? undefined : { scale: NUTRITION_MOTION.press.scale }

  function commit() {
    setEditing(false)
    onCommit(draft)
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <motion.button
        type="button"
        aria-label={`Disminuir ${label}`}
        disabled={value <= PORTIONS_MIN}
        onClick={() => onStep(-1)}
        whileTap={whileTap}
        className={stepButtonClass}
      >
        <Minus aria-hidden="true" className="h-4 w-4" />
      </motion.button>
      {editing ? (
        <input
          ref={inputRef}
          aria-label={label}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          className="h-11 w-14 rounded-control border border-primary bg-surface-card px-1 text-center text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus:ring-2 focus:ring-primary/25"
        />
      ) : (
        <button
          type="button"
          aria-label={`Editar ${label}`}
          onClick={() => {
            setDraft(formatPortionsEs(value))
            setEditing(true)
          }}
          className="h-11 w-14 rounded-control border border-border-default bg-surface-card px-1 text-center text-sm font-semibold tabular-nums text-strong transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatPortionsEs(value)}
        </button>
      )}
      <motion.button
        type="button"
        aria-label={`Aumentar ${label}`}
        onClick={() => onStep(1)}
        whileTap={whileTap}
        className={stepButtonClass}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </motion.button>
    </div>
  )
}

/** Sección "Porciones a elección" de una franja (paso Construcción). */
export function PortionsSection({
  slotKey,
  slotName,
  controller,
}: {
  slotKey: string
  /** Nombre visible de la franja (para labels accesibles del picker/steppers). */
  slotName: string
  controller: PortionsController
}) {
  const reduceMotion = useReducedMotion()
  const targets = slotPortionTargets(controller.bySlot, slotKey)
  const groupById = new Map((controller.groups ?? []).map((g) => [g.id, g]))

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="text-sm font-medium text-strong">{PORTIONS_COPY.builder.sectionTitle}</p>
      <p className="mt-0.5 text-xs text-muted">{PORTIONS_COPY.builder.sectionHint}</p>

      {targets.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {targets.map((target) => {
            const group = groupById.get(target.exchangeGroupId)
            // El builder siempre agrega grupos desde el picker (catálogo ya cargado);
            // el fallback cubre re-renders raros sin romper la fila.
            const name = group?.name ?? 'Grupo'
            const label = `porciones de ${name} en ${slotName || 'la franja'}`
            return (
              <li key={target.exchangeGroupId} className="flex items-center gap-2">
                {group ? (
                  <PortionsGroupDot group={group} />
                ) : (
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full bg-border-subtle" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-strong">{name}</span>
                <PortionsStepper
                  label={label}
                  value={target.portions}
                  onStep={(dir) => controller.step(slotKey, target.exchangeGroupId, dir)}
                  onCommit={(raw) => controller.commitValue(slotKey, target.exchangeGroupId, raw)}
                />
                <motion.button
                  type="button"
                  aria-label={`Quitar ${name}`}
                  onClick={() => controller.removeGroup(slotKey, target.exchangeGroupId)}
                  whileTap={reduceMotion ? undefined : { scale: NUTRITION_MOTION.press.scale }}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </motion.button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="mt-1.5">
        <PortionsGroupPicker
          slotName={slotName}
          usedGroupIds={targets.map((t) => t.exchangeGroupId)}
          controller={controller}
          onPick={(groupId) => controller.addGroup(slotKey, groupId)}
        />
      </div>
    </div>
  )
}
