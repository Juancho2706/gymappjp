import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NutritionIntakeService, INTAKE_SOURCES } from '@/services/nutrition-intake.service'
import { gateAlumno } from '../_shared'

/**
 * Registro fuera de plan (off-plan intake) del alumno (base tier). Espejo mobile de
 * `_data/intake.queries#getRecentIntakeFoods` + `listIntakeEntriesForDate` (GET) y
 * `_actions/intake.actions#addIntakeEntryAction`/`deleteIntakeEntryAction` (POST/DELETE).
 * Reusa `NutritionIntakeService` con el cliente token-scoped del alumno (RLS = 2da capa);
 * `clientId` = uid del bearer (nunca del body).
 */

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const PostSchema = z
    .object({
        logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        foodId: z.string().uuid().nullable().optional(),
        customName: z.string().trim().min(1).max(120).nullable().optional(),
        quantity: z.number().positive().max(100000),
        unit: z.enum(['g', 'ml', 'un']),
        source: z.enum(INTAKE_SOURCES).optional(),
    })
    .refine((v) => Boolean(v.foodId) || Boolean(v.customName), {
        message: 'Debes indicar un alimento del catalogo o un nombre libre.',
    })

/** GET ?date=YYYY-MM-DD → { entries: IntakeEntryWithFood[], recentFoods: IntakeFoodRef[] }. */
export async function GET(request: NextRequest) {
    const gate = await gateAlumno(request, { write: false })
    if (!gate.ok) return gate.response

    const date = new URL(request.url).searchParams.get('date')
    const parsed = DateSchema.safeParse(date)
    if (!parsed.success) {
        return NextResponse.json({ error: 'Parametro date invalido (YYYY-MM-DD)' }, { status: 400 })
    }

    const service = new NutritionIntakeService(gate.userClient)
    try {
        const [entries, recentFoods] = await Promise.all([
            service.listIntakeEntriesForDate(gate.clientId, parsed.data),
            service.listRecentIntakeFoods(gate.clientId, 10),
        ])
        return NextResponse.json({ entries, recentFoods })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
    }
}

/** POST { logDate, foodId?|customName?, quantity, unit, source? } → { entry: IntakeEntryWithFood }. */
export async function POST(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const raw = await request.json().catch(() => null)
    const parsed = PostSchema.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }, { status: 400 })
    }

    // Si referencia el catálogo, validar visibilidad (RLS de foods) — evita food_id colgante (espejo web).
    if (parsed.data.foodId) {
        const { data: food } = await gate.userClient.from('foods').select('id').eq('id', parsed.data.foodId).maybeSingle()
        if (!food) return NextResponse.json({ error: 'Alimento no encontrado' }, { status: 400 })
    }

    const entry = await new NutritionIntakeService(gate.userClient).insertIntakeEntry({
        clientId: gate.clientId,
        logDate: parsed.data.logDate,
        foodId: parsed.data.foodId ?? null,
        customName: parsed.data.customName ?? null,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        source: parsed.data.source ?? 'offplan',
    })
    if (!entry) return NextResponse.json({ error: 'No se pudo registrar' }, { status: 400 })
    return NextResponse.json({ entry })
}

/** DELETE ?entryId=uuid → { ok } (borra una entrada de intake del alumno). */
export async function DELETE(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const entryId = new URL(request.url).searchParams.get('entryId')
    const parsed = z.string().uuid().safeParse(entryId)
    if (!parsed.success) return NextResponse.json({ error: 'entryId invalido' }, { status: 400 })

    const ok = await new NutritionIntakeService(gate.userClient).deleteIntakeEntry(gate.clientId, parsed.data)
    if (!ok) return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 400 })
    return NextResponse.json({ ok: true })
}
