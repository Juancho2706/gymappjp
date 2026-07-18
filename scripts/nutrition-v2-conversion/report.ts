/**
 * Helpers PUROS del driver de conversion V1 -> V2 (sin I/O): orden de corrida, gate
 * fail-closed de porciones no mapeables, y el desglose de fidelidad por comida/grupo
 * (SPEC specs/nutrition-portions/SPEC.md R7, criterio 9; TASKS T3.2).
 *
 * Separado de `convert-v1-plans.ts` (que hace I/O contra Supabase) para poder testear
 * con vitest sin tocar la DB — ver `report.test.ts`.
 */

import type { ConversionExchangeGroup, V1MealRow } from '@eva/nutrition-v2/conversion'

// ---------------------------------------------------------------------------
// Orden de corrida parametrizable (--priority <clientId1,clientId2,...>)
// ---------------------------------------------------------------------------

/** Parsea el flag `--priority` (lista separada por comas) a ids limpios, sin duplicados. */
export function parsePriorityIds(raw: string | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * Reordena `items` poniendo primero los que matchean `priorityIds` (EN el orden dado por
 * `priorityIds`), y despues el resto en su orden original. Con `priorityIds=[]` devuelve
 * una copia sin tocar el orden (comportamiento previo a T3.2). Varios items con el mismo
 * id de prioridad (p.ej. duplicados activos del mismo cliente) quedan todos al frente,
 * juntos, en su orden relativo original.
 */
export function reorderByPriority<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  priorityIds: readonly string[],
): T[] {
  if (priorityIds.length === 0) return items.slice()
  const byId = new Map<string, T[]>()
  for (const item of items) {
    const id = idOf(item)
    const list = byId.get(id) ?? []
    list.push(item)
    byId.set(id, list)
  }
  const head: T[] = []
  const consumed = new Set<T>()
  for (const pid of priorityIds) {
    for (const item of byId.get(pid) ?? []) {
      head.push(item)
      consumed.add(item)
    }
  }
  const tail = items.filter((item) => !consumed.has(item))
  return [...head, ...tail]
}

// ---------------------------------------------------------------------------
// Gate fail-closed de porciones no mapeables (criterio 9 / T3.2)
// ---------------------------------------------------------------------------

/**
 * `true` si el plan NO debe aplicarse: tiene al menos un target de porciones no mapeable
 * (`ConversionFidelity.unmappedExchangeTargets`) y no se paso el override explicito
 * `--allow-unmapped-exchanges`. Cero invencion: nunca se completa el dato faltante, solo
 * se decide si el plan se escribe parcial (override) o se bloquea entero (default).
 */
export function isFailClosedBlocked(unmappedCount: number, allowOverride: boolean): boolean {
  return unmappedCount > 0 && !allowOverride
}

// ---------------------------------------------------------------------------
// Desglose de fidelidad por comida/grupo (criterio 9: "porciones-in == porciones-out")
// ---------------------------------------------------------------------------

export type GroupLookup = Map<string, { code: string; name: string }>

export function buildGroupLookup(groups: readonly ConversionExchangeGroup[]): GroupLookup {
  const lookup: GroupLookup = new Map()
  for (const g of groups) lookup.set(g.id, { code: g.code, name: g.name })
  return lookup
}

export type MealExchangeTargetView = {
  mealId: string
  mealName: string
  groupId: string
  groupCode: string
  groupName: string
  portionsV1: number
  mapped: boolean
}

/**
 * `true` si `mealId`+`groupId` aparece en la lista `unmappedExchangeTargets` que devuelve
 * el mapper puro (`conversion.ts`). Los 3 formatos posibles de esa lista (grilla 0,5
 * invalida / grupo sin resolver / base de `composed_of` sin resolver) SIEMPRE arrancan con
 * `meal=<id> group`; se matchea por prefijo `meal=<id> group_id=<id>` (los dos primeros
 * casos) o `meal=<id> group=<code>` (el tercero, que solo tiene el codigo, no el id crudo).
 * Acoplado al formato de texto de `conversion.ts` a proposito (mismo modulo, mismo commit;
 * lo cubre `conversion.test.ts` del lado del mapper) — es un helper de REPORTE, no decide
 * que se escribe: la fuente de verdad de que filas se insertan es siempre `bundle.exchangeTargetRows`.
 */
function isUnmappedTarget(mealId: string, groupId: string, groupCode: string | null, unmapped: readonly string[]): boolean {
  const byId = `meal=${mealId} group_id=${groupId}`
  const byCode = groupCode != null ? `meal=${mealId} group=${groupCode}` : null
  return unmapped.some((entry) => entry.startsWith(byId) || (byCode != null && entry.startsWith(byCode)))
}

/**
 * Desglose por comida/grupo de los targets DECLARADOS en V1 (`meal.exchangeTargets`),
 * cruzado contra `unmappedExchangeTargets` para marcar mapeado/no-mapeable. Cero invencion:
 * lista exactamente lo declarado en V1, nunca infiere un grupo o corrige una cantidad.
 * Devuelve [] si ninguna comida tiene targets (plan `grams` o sin porciones).
 */
export function mealExchangeBreakdown(
  meals: readonly V1MealRow[],
  lookup: GroupLookup,
  unmapped: readonly string[],
): MealExchangeTargetView[] {
  const rows: MealExchangeTargetView[] = []
  for (const meal of meals) {
    for (const target of meal.exchangeTargets ?? []) {
      const group = lookup.get(target.exchange_group_id)
      const groupCode = group?.code ?? null
      rows.push({
        mealId: meal.id,
        mealName: meal.name,
        groupId: target.exchange_group_id,
        groupCode: groupCode ?? `(desconocido:${target.exchange_group_id.slice(0, 8)})`,
        groupName: group?.name ?? '(grupo no encontrado en el catalogo)',
        portionsV1: Number(target.portions),
        mapped: !isUnmappedTarget(meal.id, target.exchange_group_id, groupCode, unmapped),
      })
    }
  }
  return rows
}

/** Σ porciones DECLARADAS en V1 (in) por codigo de grupo — incluye las no-mapeables. */
export function declaredPortionsByGroupCode(rows: readonly MealExchangeTargetView[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    if (!Number.isFinite(row.portionsV1)) continue
    totals[row.groupCode] = (totals[row.groupCode] ?? 0) + row.portionsV1
  }
  return totals
}

// ---------------------------------------------------------------------------
// Render Markdown (puro: string in, string out)
// ---------------------------------------------------------------------------

/** Tabla "Comida | Grupo | Porciones (V1) | Estado" — [] -> ''. */
export function renderMealExchangeTable(rows: readonly MealExchangeTargetView[]): string {
  if (rows.length === 0) return ''
  const lines = ['| Comida | Grupo | Porciones (V1) | Estado |', '| --- | --- | --- | --- |']
  for (const row of rows) {
    const estado = row.mapped ? 'mapeado' : 'NO MAPEABLE'
    lines.push(`| ${row.mealName} | ${row.groupCode} (${row.groupName}) | ${row.portionsV1} | ${estado} |`)
  }
  return lines.join('\n')
}

/** Linea "in vs out" por grupo: declarado en V1 vs efectivamente mapeado/emitido. */
export function renderGroupComparisonLine(
  declaredIn: Record<string, number>,
  mappedOut: Record<string, number>,
): string {
  const codes = Array.from(new Set([...Object.keys(declaredIn), ...Object.keys(mappedOut)])).sort()
  if (codes.length === 0) return ''
  return codes
    .map((code) => {
      const inN = declaredIn[code] ?? 0
      const outN = mappedOut[code] ?? 0
      const flag = inN === outN ? '' : ' ⚠ drift'
      return `${code}: in=${inN} out=${outN}${flag}`
    })
    .join(' · ')
}
