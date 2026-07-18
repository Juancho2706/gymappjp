import { apiFetch } from './api'

/**
 * Bridge de la lista de compras del alumno (E4-13). Espejo mobile de
 * `/api/mobile/nutrition/shopping` (route.ts): GET la vista fusionada, PATCH toggle
 * de check, POST alta manual, DELETE de manual. La lista se DERIVA del plan activo
 * en el server (`buildShoppingList` puro) + estado persistido (`shopping_list_items`);
 * el `clientId` lo deriva el server del bearer — NUNCA se envía desde acá. Base tier
 * (RLS `client_id = auth.uid()` = 2da capa; sin módulo pago).
 *
 * Tipos = espejo EXACTO de `apps/web/.../nutrition/_data/shopping.queries#ShoppingListView`.
 */

export interface ShoppingQuantity {
  unit: string
  quantity: number
}

export interface ShoppingItemView {
  /** Clave estable (label normalizado) para casar override optimista de check. */
  key: string
  foodId: string | null
  name: string
  category: string
  quantities: ShoppingQuantity[]
  isChecked: boolean
  isManual: boolean
  /** id de fila `shopping_list_items` cuando hay estado persistido (manual o check). */
  stateId: string | null
}

export interface ShoppingAisleView {
  category: string
  items: ShoppingItemView[]
}

export interface ShoppingListView {
  planId: string | null
  aisles: ShoppingAisleView[]
}

/** GET → vista fusionada (líneas derivadas del plan activo + check/manual, por pasillo). */
export function getShoppingList() {
  return apiFetch<ShoppingListView>('/api/mobile/nutrition/shopping', {
    authenticated: true,
  })
}

/** PATCH → marca/desmarca una línea (derivada o manual). Idempotente (`isChecked` = estado deseado). */
export function toggleShoppingItem(input: {
  planId: string | null
  label: string
  category?: string | null
  isChecked: boolean
}) {
  return apiFetch<{ ok: true }>('/api/mobile/nutrition/shopping', {
    method: 'PATCH',
    authenticated: true,
    body: input,
  })
}

/** POST → agrega un ítem manual (fuera del plan). Idempotente por label. */
export function addManualShoppingItem(input: {
  planId: string | null
  label: string
  category?: string | null
}) {
  return apiFetch<{ ok: true; id?: string }>('/api/mobile/nutrition/shopping', {
    method: 'POST',
    authenticated: true,
    body: input,
  })
}

/** DELETE → borra un ítem manual del alumno (sólo `is_manual`). */
export function removeManualShoppingItem(itemId: string) {
  return apiFetch<{ ok: true }>(
    `/api/mobile/nutrition/shopping?itemId=${encodeURIComponent(itemId)}`,
    { method: 'DELETE', authenticated: true },
  )
}

/**
 * Texto plano para compartir (native Share). Sólo lo PENDIENTE, agrupado por pasillo
 * — espejo de `buildShareText` de la web. PURO (testeable, sin RN).
 */
export function buildShoppingShareText(list: ShoppingListView): string {
  const lines: string[] = ['🛒 Lista de compras']
  for (const aisle of list.aisles) {
    const pending = aisle.items.filter((i) => !i.isChecked)
    if (pending.length === 0) continue
    lines.push('', `*${aisle.category}*`)
    for (const item of pending) {
      const q = quantityLabel(item)
      lines.push(`• ${item.name}${q ? ` — ${q}` : ''}`)
    }
  }
  return lines.join('\n')
}

/** Cantidad agregada legible de una línea (una por unidad, redondeada). */
export function quantityLabel(item: ShoppingItemView): string {
  if (item.quantities.length === 0) return ''
  return item.quantities.map((q) => `${roundish(q.quantity)} ${q.unit}`).join(' + ')
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}
