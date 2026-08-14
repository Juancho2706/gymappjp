import { NextResponse } from 'next/server'
import {
  correctIntakeAction,
  loadSubstitutionGroupPageAction,
  markPortionIntakeAction,
  recordIntakeAction,
  recordSlotIntakeBatchAction,
  recordSubstitutionIntakeAction,
  searchFoodCatalogAction,
  undoPortionIntakeAction,
  voidIntakeAction,
  voidSlotIntakeBatchAction,
} from '../../../c/[coach_slug]/nutrition-v2/_actions/intake.actions'
import {
  getFavoriteFoodIdsAction,
  listFavoriteFoodsAction,
  toggleFavoriteFoodAction,
} from '../../../c/[coach_slug]/nutrition-v2/_actions/favorites.actions'
import { fetchNutritionTodayAction } from '../../../c/[coach_slug]/nutrition-v2/_actions/today.actions'
import { fetchNutritionHistoryWeeksAction } from '../../../c/[coach_slug]/nutrition-v2/_actions/history.actions'

/**
 * Puente HTTP del área del alumno (QA T2.7 F4, hallazgo H12 — 2026-08-14).
 *
 * Las mutaciones y lecturas del Hoy dejaron de viajar como SERVER ACTIONS desde el cliente:
 * en Next 16.3.0 toda server action se despacha por el ActionQueue del App Router y, de forma
 * reproducible, la acción de "marcar un alimento" dejaba el router incapaz de volver a navegar
 * hasta recargar (H9/H11 la acotaron pero el apply del action seguía colgándose por caminos
 * internos: revalidación implícita, seed del flight). Un `fetch()` a este handler NO toca el
 * router: cero acciones encoladas, cero applies, cero navegación interna — la clase entera de
 * bugs muere.
 *
 * Cero lógica nueva: cada `op` despacha a la MISMA función de `_actions/*` (autorización por
 * cookies, rate-limit y Zod viven adentro de cada una; el body se pasa crudo como `unknown`).
 * Las funciones siguen exportadas como server actions para quien las quiera importar
 * server-side; lo que cambió es el TRANSPORTE desde el navegador del alumno.
 */

const OPS = {
  record: recordIntakeAction,
  correct: correctIntakeAction,
  void: voidIntakeAction,
  batchRecord: recordSlotIntakeBatchAction,
  batchVoid: voidSlotIntakeBatchAction,
  substitute: recordSubstitutionIntakeAction,
  substitutionGroupPage: loadSubstitutionGroupPageAction,
  search: searchFoodCatalogAction,
  // Las dos de porciones tipan su input nominalmente pero VALIDAN con Zod adentro
  // (MarkPortionInputSchema / UndoPortionInputSchema): el cast solo calla al compilador.
  markPortion: (input) => markPortionIntakeAction(input as Parameters<typeof markPortionIntakeAction>[0]),
  undoPortion: (input) => undoPortionIntakeAction(input as Parameters<typeof undoPortionIntakeAction>[0]),
  favoriteIds: getFavoriteFoodIdsAction,
  favoriteList: listFavoriteFoodsAction,
  favoriteToggle: toggleFavoriteFoodAction,
  fetchToday: fetchNutritionTodayAction,
  historyWeeks: fetchNutritionHistoryWeeksAction,
} as const satisfies Record<string, (input: unknown) => Promise<unknown>>

type OpName = keyof typeof OPS

export async function POST(request: Request): Promise<NextResponse> {
  // CSRF: las server actions traían el chequeo de origen de Next; este canal lo repone. Con
  // cookies como credencial, un POST cross-site debe morir acá (la RLS igual gatearía, pero la
  // defensa barata va primero). `sec-fetch-site` falta solo en agentes viejos: se exige cuando
  // viene, y el fallback compara `origin` contra el host del request.
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') {
    return NextResponse.json({ ok: false, error: 'Origen no permitido.' }, { status: 403 })
  }
  const origin = request.headers.get('origin')
  if (origin) {
    const requestOrigin = new URL(request.url).origin
    if (origin !== requestOrigin) {
      return NextResponse.json({ ok: false, error: 'Origen no permitido.' }, { status: 403 })
    }
  }

  let body: { op?: unknown; input?: unknown }
  try {
    body = (await request.json()) as { op?: unknown; input?: unknown }
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido.' }, { status: 400 })
  }

  const op = typeof body.op === 'string' && body.op in OPS ? (body.op as OpName) : null
  if (op === null) {
    return NextResponse.json({ ok: false, error: 'Operación desconocida.' }, { status: 400 })
  }

  try {
    const result = await OPS[op](body.input)
    return NextResponse.json(result)
  } catch {
    // Las funciones de _actions devuelven fallos como valor; un throw acá es un error de
    // infraestructura (red a Supabase, bug). Nunca filtrar el detalle al cliente.
    return NextResponse.json(
      { ok: false, error: 'No se pudo completar la acción. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
