'use client'

/**
 * Form de grupo de porciones PROPIO (crear/editar) — porciones propias P-A.
 * Vive DENTRO del mismo popover/sheet del picker (`PortionsGroupPicker`): el coach nunca
 * pierde el contexto de la franja que estaba armando.
 *
 * Reglas de UX cerradas en specs/nutrition-custom-portions/SPEC.md:
 *  - Código sugerido a partir del nombre mientras el coach no lo edite a mano.
 *  - kcal autocalculadas con 4/4/9 mientras el coach no las edite a mano (sigue editable).
 *  - Color: SOLO swatches de la paleta compartida (`EXCHANGE_GROUP_PALETTE`), que es el
 *    espejo de la paleta de fallback del motor. Es identidad del grupo, no color de marca.
 *  - Badge "Valores referenciales" automático: los grupos propios se guardan siempre con
 *    `macros_confirmed = false` (lo fuerza el repository, no la UI).
 *
 * La validación dura vive en `@eva/schemas/nutrition-exchanges` + servicio (unicidad de
 * código/slug). Acá solo se evitan viajes obviamente inválidos y se muestra el error del
 * servidor tal cual (mensajes ya en español).
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  EXCHANGE_GROUP_NAME_MAX,
  EXCHANGE_GROUP_PALETTE,
  exchangeGroupKcalFromMacros,
  toExchangeGroupSlug,
} from '@eva/schemas/nutrition-exchanges'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

export type ExchangeGroupFormValues = {
  name: string
  code: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  color: string | null
}

/** "Colación Fran" -> "COL". Solo sugerencia: el coach puede sobrescribirla. */
export function suggestExchangeGroupCode(name: string): string {
  return toExchangeGroupSlug(name).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase()
}

const A_Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Codigo LIBRE derivado de otro ("C" -> "CA", "CB"…) para duplicar un grupo del sistema sin
 * chocar con la unicidad que impone el servicio. El schema solo acepta 1-3 letras, asi que no
 * sirve el clasico sufijo numerico: se prueban sufijos de una y dos letras.
 */
export function suggestFreeExchangeGroupCode(base: string, taken: readonly string[]): string {
  const ocupados = new Set(taken.map((code) => code.trim().toUpperCase()))
  const raiz = base.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'G'
  for (const letra of A_Z) {
    const candidato = (raiz.slice(0, 2) + letra).slice(0, 3)
    if (!ocupados.has(candidato)) return candidato
  }
  for (const primera of A_Z) {
    for (const segunda of A_Z) {
      const candidato = raiz.slice(0, 1) + primera + segunda
      if (!ocupados.has(candidato)) return candidato
    }
  }
  // Inalcanzable con 26² combinaciones libres por raiz; el servidor es el techo real igual.
  return raiz
}

/** Acepta coma decimal es-CL ("1,5"); vacío = 0. `null` = entrada inválida. */
function parseNumberEs(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatNumberEs(value: number): string {
  return String(value).replace('.', ',')
}

const fieldClass =
  'h-10 w-full rounded-control border border-border-default bg-surface-card px-2.5 text-sm text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
const labelClass = 'block text-xs font-medium text-muted'

export function PortionsGroupForm({
  group,
  initial,
  submitting,
  serverError,
  onCancel,
  onSubmit,
}: {
  /** null = creación; grupo = edición de uno propio. */
  group: ExchangeGroup | null
  /**
   * Valores de arranque de una creación PRECARGADA ("Duplicar y ajustar" de un grupo del
   * sistema). Solo se lee cuando `group` es null: en edición manda el grupo. El código ya
   * viene libre de colisiones, así que arranca "tocado" y el form no lo re-sugiere.
   */
  initial?: ExchangeGroupFormValues | null
  submitting: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (values: ExchangeGroupFormValues) => void
}) {
  const copy = PORTIONS_COPY.groupEditor
  const seed = group ?? initial ?? null
  const [name, setName] = useState(seed ? (group?.name ?? initial?.name ?? '') : '')
  const [code, setCode] = useState(seed ? (group?.code ?? initial?.code ?? '') : '')
  const [codeTouched, setCodeTouched] = useState(seed != null)
  const [protein, setProtein] = useState(seed ? formatNumberEs(group?.refProteinG ?? initial!.refProteinG) : '0')
  const [carbs, setCarbs] = useState(seed ? formatNumberEs(group?.refCarbsG ?? initial!.refCarbsG) : '0')
  const [fats, setFats] = useState(seed ? formatNumberEs(group?.refFatsG ?? initial!.refFatsG) : '0')
  const [kcal, setKcal] = useState(seed ? formatNumberEs(group?.refCalories ?? initial!.refCalories) : '0')
  const [kcalTouched, setKcalTouched] = useState(seed != null)
  const [color, setColor] = useState<string | null>(group?.color ?? initial?.color ?? null)
  const [localError, setLocalError] = useState<string | null>(null)

  /** Recalcula las kcal sugeridas salvo que el coach ya las haya escrito a mano. */
  function syncKcal(next: { protein?: string; carbs?: string; fats?: string }) {
    if (kcalTouched) return
    const p = parseNumberEs(next.protein ?? protein)
    const c = parseNumberEs(next.carbs ?? carbs)
    const f = parseNumberEs(next.fats ?? fats)
    if (p == null || c == null || f == null) return
    setKcal(String(exchangeGroupKcalFromMacros({ refProteinG: p, refCarbsG: c, refFatsG: f })))
  }

  function handleNameChange(next: string) {
    setName(next)
    if (!codeTouched) setCode(suggestExchangeGroupCode(next))
  }

  function handleSubmit() {
    const trimmedName = name.trim()
    if (trimmedName.length === 0 || toExchangeGroupSlug(trimmedName).length === 0) {
      setLocalError(copy.nameRequired)
      return
    }
    const trimmedCode = code.trim().toUpperCase()
    if (!/^[A-Z]{1,3}$/.test(trimmedCode)) {
      setLocalError(copy.codeRequired)
      return
    }
    const p = parseNumberEs(protein)
    const c = parseNumberEs(carbs)
    const f = parseNumberEs(fats)
    const k = parseNumberEs(kcal)
    if (p == null || c == null || f == null || k == null) {
      setLocalError(copy.macrosRequired)
      return
    }
    setLocalError(null)
    onSubmit({
      name: trimmedName,
      code: trimmedCode,
      refCalories: k,
      refProteinG: p,
      refCarbsG: c,
      refFatsG: f,
      color,
    })
  }

  const error = localError ?? serverError

  return (
    <div className="space-y-3 p-1.5">
      <p className="text-sm font-semibold text-strong">
        {group ? copy.editTitle : initial ? copy.duplicateTitle : copy.createTitle}
      </p>

      {/* Duplicado: se dice explicitamente que es una copia y que el original no se toca. */}
      {!group && initial ? <p className="text-[11px] leading-relaxed text-muted">{copy.duplicateHint}</p> : null}

      {/* Edicion: los planes publicados llevan los macros CONGELADOS del momento de publicar
          (`snapshot_ref_*`), asi que este cambio no los alcanza. Antes no lo decia nadie. */}
      {group ? (
        <p className="rounded-control bg-surface-sunken px-2 py-1.5 text-[11px] leading-relaxed text-muted">
          {copy.publishedFrozenNotice}
        </p>
      ) : null}

      <div>
        <label className={labelClass} htmlFor="portions-group-name">
          {copy.nameLabel}
        </label>
        <input
          id="portions-group-name"
          value={name}
          maxLength={EXCHANGE_GROUP_NAME_MAX}
          placeholder={copy.namePlaceholder}
          onChange={(e) => handleNameChange(e.target.value)}
          className={fieldClass + ' mt-1'}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="portions-group-code">
          {copy.codeLabel}
        </label>
        <input
          id="portions-group-code"
          value={code}
          maxLength={3}
          onChange={(e) => {
            setCodeTouched(true)
            setCode(e.target.value.toUpperCase())
          }}
          className={fieldClass + ' mt-1 w-20 uppercase'}
        />
        <p className="mt-1 text-[11px] text-muted">{copy.codeHint}</p>
      </div>

      <div>
        <p className={labelClass}>{copy.macrosLabel}</p>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <div>
            <label className="block text-[11px] text-muted" htmlFor="portions-group-protein">
              {copy.proteinLabel}
            </label>
            <input
              id="portions-group-protein"
              inputMode="decimal"
              value={protein}
              onChange={(e) => {
                setProtein(e.target.value)
                syncKcal({ protein: e.target.value })
              }}
              className={fieldClass + ' mt-0.5 tabular-nums'}
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted" htmlFor="portions-group-carbs">
              {copy.carbsLabel}
            </label>
            <input
              id="portions-group-carbs"
              inputMode="decimal"
              value={carbs}
              onChange={(e) => {
                setCarbs(e.target.value)
                syncKcal({ carbs: e.target.value })
              }}
              className={fieldClass + ' mt-0.5 tabular-nums'}
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted" htmlFor="portions-group-fats">
              {copy.fatsLabel}
            </label>
            <input
              id="portions-group-fats"
              inputMode="decimal"
              value={fats}
              onChange={(e) => {
                setFats(e.target.value)
                syncKcal({ fats: e.target.value })
              }}
              className={fieldClass + ' mt-0.5 tabular-nums'}
            />
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="portions-group-kcal">
          {copy.kcalLabel}
        </label>
        <input
          id="portions-group-kcal"
          inputMode="decimal"
          value={kcal}
          onChange={(e) => {
            setKcalTouched(true)
            setKcal(e.target.value)
          }}
          className={fieldClass + ' mt-1 w-28 tabular-nums'}
        />
        <p className="mt-1 text-[11px] text-muted">{copy.kcalHint}</p>
      </div>

      <div>
        <p className={labelClass}>{copy.colorLabel}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXCHANGE_GROUP_PALETTE.map((swatch, index) => (
            <button
              key={swatch}
              type="button"
              aria-label={copy.colorOption(index + 1)}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
              className={
                'h-8 w-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (color === swatch ? 'border-primary scale-110' : 'border-transparent')
              }
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <p className="rounded-control bg-surface-sunken px-2 py-1.5 text-[11px] text-muted">
        {copy.referentialNotice}
      </p>

      {error ? (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {copy.cancel}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control bg-primary px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {submitting ? copy.saving : copy.save}
        </button>
      </div>
    </div>
  )
}
