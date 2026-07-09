import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { NutritionNotesService } from '@/services/nutrition-notes.service'
import { gateAlumno } from '../_shared'

/**
 * Notas bidireccionales coach⇄alumno del hilo de nutrición del alumno (base tier).
 * Espejo mobile de `_data/nutrition-notes.queries#getClientMealComments` (GET) y
 * `_actions/nutrition-notes.actions#addClientMealComment` (POST). Reusa
 * `NutritionNotesService` con el cliente token-scoped del alumno (RLS = 2da capa);
 * `authorRole='client'` y `author_id` = uid del bearer (nunca del body).
 */

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const PostSchema = z
    .object({
        mealLogId: z.string().min(1).nullish(),
        logDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullish(),
        body: z.string().trim().min(1).max(2000),
    })
    .refine((v) => Boolean(v.mealLogId) || Boolean(v.logDate), {
        message: 'Se requiere mealLogId o logDate.',
    })

/** GET ?date=YYYY-MM-DD → { comments: MealCommentRow[] } (hilo del día, orden cronológico). */
export async function GET(request: NextRequest) {
    const gate = await gateAlumno(request, { write: false })
    if (!gate.ok) return gate.response

    const date = new URL(request.url).searchParams.get('date')
    const parsed = DateSchema.safeParse(date)
    if (!parsed.success) {
        return NextResponse.json({ error: 'Parametro date invalido (YYYY-MM-DD)' }, { status: 400 })
    }

    try {
        const comments = await new NutritionNotesService(gate.userClient).listMealComments(gate.clientId, parsed.data)
        return NextResponse.json({ comments })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
    }
}

/** POST { body, logDate? , mealLogId? } → { comment: MealCommentRow } (mensaje del alumno). */
export async function POST(request: NextRequest) {
    const gate = await gateAlumno(request, { write: true })
    if (!gate.ok) return gate.response

    const raw = await request.json().catch(() => null)
    const parsed = PostSchema.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }, { status: 400 })
    }

    try {
        const comment = await new NutritionNotesService(gate.userClient).addMealComment({
            clientId: gate.clientId,
            authorId: gate.clientId,
            mealLogId: parsed.data.mealLogId ?? null,
            logDate: parsed.data.logDate ?? null,
            body: parsed.data.body,
            authorRole: 'client',
        })
        return NextResponse.json({ comment })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo enviar el comentario.' }, { status: 400 })
    }
}
