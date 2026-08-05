import 'server-only'

import { ageFromBirthDate } from '@eva/cardio'
import { createClient } from '@/lib/supabase/server'
import type { BuilderClientMetrics, SuggestionSex } from '../_lib/target-suggestion'

/**
 * Datos duros del alumno para "Sugerir metas" del paso 1 (BD1): edad (derivada de
 * `clients.birth_date`), peso, estatura y sexo (`client_intake`, tabla 1:1).
 *
 * Query MINIMA y propia del builder a proposito: `getClientProfileData` (services/client) trae la
 * ficha completa —programa activo, check-ins, planes, bodycomp— y montarla aca para leer tres
 * columnas seria pagar toda esa lectura en el TTFB del creador. La RLS del coach ya cubre ambas
 * tablas: un alumno de otro pool simplemente no devuelve fila.
 *
 * FAIL-SOFT (a diferencia de `plan-foods.data`, que es fail-closed): esto es una AYUDA, no parte
 * del plan. Si la lectura falla, el panel se abre igual con los campos vacios y el coach los
 * escribe a mano — nada que publicar queda mutilado.
 */

/** Fila cruda del embed 1:1 `client_intake`. */
interface IntakeRow {
  weight_kg: number | null
  height_cm: number | null
  sex: string | null
}

/** El embed 1:1 puede llegar como objeto o como arreglo de uno segun la version del cliente. */
function firstIntake(value: unknown): IntakeRow | null {
  if (value == null) return null
  if (Array.isArray(value)) return (value[0] as IntakeRow | undefined) ?? null
  return value as IntakeRow
}

/** `client_intake.sex` es texto libre en la base ('male' | 'female' | 'other' | null). */
function toSuggestionSex(value: string | null | undefined): SuggestionSex | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'male') return 'male'
  if (normalized === 'female') return 'female'
  // 'other' (y cualquier valor inesperado) no mapea a la ecuacion de Mifflin-St Jeor, que solo
  // tiene dos constantes: se deja sin precargar y el coach elige.
  return null
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

interface ClientMetricsRow {
  birth_date: string | null
  client_intake: unknown
}

type MetricsQueryResult = { data: ClientMetricsRow | null; error: { message: string } | null }

// El cliente tipado no expone el embed con esta forma exacta; misma tactica que
// `plan-foods.data.ts`: interfaz minima tipada sobre la cadena que se usa.
interface MetricsReadChain extends PromiseLike<MetricsQueryResult> {
  eq(column: string, value: string): MetricsReadChain
  maybeSingle(): PromiseLike<MetricsQueryResult>
}
interface MetricsReadDb {
  from(table: string): { select(columns: string): MetricsReadChain }
}

const METRICS_SELECT = 'birth_date, client_intake ( weight_kg, height_cm, sex )'

/**
 * Metricas del alumno, o `null` si no hay nada util que precargar (sin ficha, sin permisos o
 * lectura caida). `today` se inyecta para que la edad sea la del huso del producto y para poder
 * testear el borde del cumpleaños.
 */
export async function fetchBuilderClientMetrics(
  clientId: string,
  today: Date = new Date(),
): Promise<BuilderClientMetrics | null> {
  try {
    const db = (await createClient()) as unknown as MetricsReadDb
    const { data, error } = await db.from('clients').select(METRICS_SELECT).eq('id', clientId).maybeSingle()
    if (error || !data) {
      if (error) {
        console.error('nutrition_v2_web_read', {
          source: 'builder_client_metrics',
          message: error.message,
        })
      }
      return null
    }
    const intake = firstIntake(data.client_intake)
    const metrics: BuilderClientMetrics = {
      age: ageFromBirthDate(data.birth_date, today),
      weightKg: positiveOrNull(intake?.weight_kg),
      heightCm: positiveOrNull(intake?.height_cm),
      sex: toSuggestionSex(intake?.sex),
    }
    // Sin ningun dato util no vale la pena viajar al cliente: el panel arranca vacio igual.
    const hasAnything =
      metrics.age !== null || metrics.weightKg !== null || metrics.heightCm !== null || metrics.sex !== null
    return hasAnything ? metrics : null
  } catch (err) {
    console.error('nutrition_v2_web_read', {
      source: 'builder_client_metrics',
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
