'use client'

import type { NutritionTodayReadModel } from '@eva/nutrition-v2'

/**
 * Última verdad conocida del read model del Hoy, POR PESTAÑA (module-level, sobrevive al
 * desmontaje del componente pero no a una recarga).
 *
 * Por qué existe (QA T2.7 F4, hallazgo H10 — auditoría 2026-08-14): las mutaciones del alumno ya
 * no llaman `router.refresh()` (ver `navigation-gate.ts`) y las server actions del área no
 * revalidan, así que NADA evicta el router/prefetch cache del cliente
 * (`server-action-reducer.js` solo evicta con `didRevalidate`). Al volver de Plan/Historial a
 * Hoy, el RSC puede llegar con el payload de ANTES de la mutación y el check registrado
 * "desaparecía". Este cache conserva la verdad post-mutación entre montajes; el componente lo
 * prefiere sobre un `serverToday` potencialmente stale y reconcilia enseguida con la action de
 * lectura (`fetchNutritionTodayAction`), que es la que decide de verdad.
 */

const cache = new Map<string, NutritionTodayReadModel>()

const keyOf = (clientId: string, localDate: string) => `${clientId}|${localDate}`

export function readTodayCache(clientId: string, localDate: string): NutritionTodayReadModel | null {
  return cache.get(keyOf(clientId, localDate)) ?? null
}

export function writeTodayCache(clientId: string, today: NutritionTodayReadModel): void {
  cache.set(keyOf(clientId, today.localDate), today)
}
