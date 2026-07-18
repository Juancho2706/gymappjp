import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
    getShoppingListView,
    toggleShoppingItem,
    addManualItem,
    removeManualItem,
} from '@/services/nutrition-shopping.service'
import { gateAlumno } from '../_shared'

/**
 * Lista de compras del alumno (base tier). Espejo mobile de
 * `_data/shopping.queries#getShoppingList` (GET) y `_actions/shopping.actions`
 * (PATCH=toggle, POST=agregar manual, DELETE=borrar manual). La lógica de fetch+merge
 * vive en `getShoppingListView` (servicio) — misma vista que la web, cero drift.
 * Cliente token-scoped del alumno (RLS = 2da capa); `clientId` = uid del bearer.
 */

const PatchSchema = z.object({
    planId: z.string().uuid().nullable(),
    label: z.string().min(1).max(200),
    category: z.string().max(120).nullable().optional(),
    isChecked: z.boolean(),
})

const PostSchema = z.object({
    planId: z.string().uuid().nullable(),
    label: z.string().min(1).max(200),
    category: z.string().max(120).nullable().optional(),
})

/** GET → { planId, aisles } (líneas derivadas del plan activo + estado de check/manual, por pasillo). */
export async function GET(request: NextRequest) {
    const gate = await gateAlumno(request, { write: false })
    if (!gate.ok) return gate.response

    try {
        const list = await getShoppingListView(gate.userClient, gate.clientId)
        return NextResponse.json(list)
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
    }
}

/** PATCH { planId, label, category?, isChecked } → { ok } (marca/desmarca una línea; idempotente). */
export async function PATCH(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const raw = await request.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 })

    const result = await toggleShoppingItem(gate.userClient, {
        clientId: gate.clientId,
        planId: parsed.data.planId,
        label: parsed.data.label,
        category: parsed.data.category ?? null,
        isChecked: parsed.data.isChecked,
    })
    if (!result.success) return NextResponse.json({ error: result.error ?? 'No se pudo actualizar' }, { status: 400 })
    return NextResponse.json({ ok: true })
}

/** POST { planId, label, category? } → { ok, id } (agrega ítem manual; idempotente por label). */
export async function POST(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const raw = await request.json().catch(() => null)
    const parsed = PostSchema.safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 })

    const result = await addManualItem(gate.userClient, {
        clientId: gate.clientId,
        planId: parsed.data.planId,
        label: parsed.data.label,
        category: parsed.data.category ?? null,
    })
    if (!result.success) return NextResponse.json({ error: result.error ?? 'No se pudo agregar' }, { status: 400 })
    return NextResponse.json({ ok: true, id: result.id })
}

/** DELETE ?itemId=uuid → { ok } (borra un ítem manual del alumno; sólo is_manual). */
export async function DELETE(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const itemId = new URL(request.url).searchParams.get('itemId')
    const parsed = z.string().uuid().safeParse(itemId)
    if (!parsed.success) return NextResponse.json({ error: 'itemId invalido' }, { status: 400 })

    const result = await removeManualItem(gate.userClient, gate.clientId, parsed.data)
    if (!result.success) return NextResponse.json({ error: result.error ?? 'No se pudo eliminar' }, { status: 400 })
    return NextResponse.json({ ok: true })
}
