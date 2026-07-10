/**
 * Tipos ESPEJO del payload de creacion del modulo `body_composition` — PUROS (sin Zod, sin IO).
 *
 * Por que existen: la validacion viva en `@eva/schemas/bodycomp` (Zod), pero ese subpath NO es
 * importable client-side en mobile:
 *   1. `packages/schemas/package.json` solo declara el export `.` (index barrel); no hay subpath
 *      `./bodycomp` en el mapa `exports`, asi que Metro/Node lo bloquean.
 *   2. `apps/mobile/tsconfig.json` mapea solo `@eva/schemas` (el barrel), que reexporta schemas
 *      marcados SERVER-ONLY (org/coupon/team) — no queremos arrastrarlos a mobile.
 *
 * Por eso mobile tipa el body que envia a `/api/mobile/bodycomp/*` con estos espejos. La VALIDACION
 * real (rangos fisiologicos, `.strict()`, calculo ISAK) la hace el server con `BodyCompositionCreateSchema`
 * + `computeIsak`. Estos tipos NO validan: solo dan forma. Mantener en sync con
 * `packages/schemas/bodycomp.ts` (fuente de verdad del contrato).
 */

import type { BiaMetrics, BodyFatEquation, IsakRawInput } from './types'

/** Condiciones de la medicion (ambos metodos, opcional). Espeja `MeasurementConditionsSchema`. */
export interface MeasurementConditions {
  fasted?: boolean
  hydrationNote?: string
  timeOfDay?: string
}

/** Campos comunes a BIA e ISAK (espeja `baseFields` del schema). */
export interface BodyCompositionBaseFields {
  clientId: string
  /** ISO datetime; el server usa `now()` si se omite. */
  measuredAt?: string
  weightKg?: number | null
  heightCm?: number | null
  deviceBrand?: string | null
  deviceModel?: string | null
  measurementConditions?: MeasurementConditions
  notes?: string | null
}

/** Payload BIA: captura manual del reporte del dispositivo (el server persiste `metrics` tal cual). */
export interface BiaCreateInput extends BodyCompositionBaseFields {
  method: 'bia'
  metrics: BiaMetrics
}

/**
 * Payload ISAK: el cliente envia SOLO los crudos + la ecuacion; los `metrics` derivados los calcula
 * el server con `computeIsak`. `bodyFatEquation` es opcional en el envio — el server aplica el
 * default `durnin_womersley` (por eso el create de ISAK NO acepta `metrics`).
 */
export interface IsakCreateInput extends BodyCompositionBaseFields {
  method: 'isak'
  rawInput: IsakRawInput
  bodyFatEquation?: BodyFatEquation
}

/** Union discriminada por `method` — espeja `BodyCompositionCreateSchema` (forma, no validacion). */
export type BodyCompositionCreateInput = BiaCreateInput | IsakCreateInput
