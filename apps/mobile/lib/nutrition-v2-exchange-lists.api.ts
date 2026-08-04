import { apiFetch } from './api'

/**
 * Listas de equivalencia por grupo de porciones — cliente mobile (F4, paridad de F2).
 *
 * MONEY-SAFETY / NUT-005: TODA mutacion (y tambien la lectura) va por
 * `/api/mobile/nutrition/exchanges/group-foods`, que corre `gateExchanges` server-side y
 * comparte el MISMO servicio que la web. Cero escrituras Supabase directas nuevas desde RN.
 *
 * La sugerencia de gramos tampoco se calcula aca: la devuelve el servidor ya resuelta, para que
 * el telefono y el navegador no puedan sugerir numeros distintos al mismo coach.
 */

const BASE = '/api/mobile/nutrition/exchanges/group-foods'

export interface ExchangeListRow {
  id: string
  foodId: string
  foodName: string
  foodBrand: string | null
  portionGrams: number | null
  portionLabel: string | null
  /** true ⇒ la fila la escribio el coach: se puede editar y devolver al catalogo. */
  isOwn: boolean
}

export interface ExchangeListCandidate {
  id: string
  name: string
  brand: string | null
  suggestedGrams: number | null
  alreadyInList: boolean
}

function rowOf(raw: unknown): ExchangeListRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.foodId !== 'string') return null
  return {
    id: row.id,
    foodId: row.foodId,
    foodName: typeof row.foodName === 'string' ? row.foodName : 'Alimento',
    foodBrand: typeof row.foodBrand === 'string' ? row.foodBrand : null,
    portionGrams: typeof row.portionGrams === 'number' ? row.portionGrams : null,
    portionLabel: typeof row.portionLabel === 'string' ? row.portionLabel : null,
    isOwn: row.isOwn === true,
  }
}

function candidateOf(raw: unknown): ExchangeListCandidate | null {
  if (!raw || typeof raw !== 'object') return null
  const food = raw as Record<string, unknown>
  if (typeof food.id !== 'string') return null
  return {
    id: food.id,
    name: typeof food.name === 'string' ? food.name : 'Alimento',
    brand: typeof food.brand === 'string' ? food.brand : null,
    suggestedGrams: typeof food.suggestedGrams === 'number' ? food.suggestedGrams : null,
    alreadyInList: food.alreadyInList === true,
  }
}

export async function fetchExchangeList(input: {
  groupId: string
  search?: string | null
}): Promise<ExchangeListRow[]> {
  const params = new URLSearchParams({ groupId: input.groupId })
  if (input.search) params.set('search', input.search)
  const raw = await apiFetch<{ rows?: unknown }>(`${BASE}?${params.toString()}`, { authenticated: true })
  return Array.isArray(raw.rows) ? raw.rows.map(rowOf).filter((row): row is ExchangeListRow => row != null) : []
}

export async function fetchExchangeListCandidates(input: {
  groupId: string
  search?: string | null
}): Promise<ExchangeListCandidate[]> {
  const params = new URLSearchParams({ groupId: input.groupId, candidates: '1' })
  if (input.search) params.set('search', input.search)
  const raw = await apiFetch<{ candidates?: unknown }>(`${BASE}?${params.toString()}`, { authenticated: true })
  return Array.isArray(raw.candidates)
    ? raw.candidates.map(candidateOf).filter((food): food is ExchangeListCandidate => food != null)
    : []
}

export type ExchangeListMutation = { ok: true } | { ok: false; error: string }

async function mutate(
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>
): Promise<ExchangeListMutation> {
  try {
    const raw = await apiFetch<{ ok?: boolean; error?: string }>(BASE, {
      authenticated: true,
      method,
      body,
    })
    return raw.ok === true ? { ok: true } : { ok: false, error: raw.error ?? 'No pudimos guardar el cambio.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No pudimos guardar el cambio.' }
  }
}

/** "1 porcion de este grupo = N g de este alimento" en MI lista. */
export function saveExchangeListEntry(input: {
  exchangeGroupId: string
  foodId: string
  portionGrams: number
  portionLabel?: string | null
}): Promise<ExchangeListMutation> {
  return mutate('POST', input)
}

/** Lapida: saca el alimento de MI lista sin tocar el catalogo global. */
export function excludeExchangeListEntry(input: {
  exchangeGroupId: string
  foodId: string
}): Promise<ExchangeListMutation> {
  return mutate('PATCH', input)
}

/** Borra MI fila ⇒ el alimento vuelve al valor del catalogo. */
export function restoreExchangeListEntry(input: {
  exchangeGroupId: string
  foodId: string
}): Promise<ExchangeListMutation> {
  return mutate('DELETE', input)
}
