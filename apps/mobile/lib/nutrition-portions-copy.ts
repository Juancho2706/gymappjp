/**
 * Wrapper RN del microcopy canonico de porciones, que vive en
 * `packages/nutrition-v2/nutrition-portions-copy.ts` (una sola tabla para web y RN).
 *
 * Existe por dos razones: no reescribir los ~15 imports de `@/lib/nutrition-portions-copy` de la
 * app, y aplicar los UNICOS dos textos que divergen de verdad en nativo. Divergir es la excepcion
 * y se justifica por INTERACCION, nunca por gusto: si el texto tiene que cambiar para todos,
 * cambia en la tabla canonica.
 */

import { PORTIONS_COPY as CANONICAL } from '@eva/nutrition-v2'

export const PORTIONS_COPY = {
  ...CANONICAL,
  builder: {
    ...CANONICAL.builder,
    // El punto de entrada para clasificar NO es el mismo: en web es el tab "Mis alimentos" del
    // hub, en nativo es la pantalla Porciones (`app/coach/nutrition-v2/portions.tsx`). Mandar al
    // coach a una pantalla que su telefono no tiene es peor que no dar pista.
    groupFoodsEmptyHint: 'Clasifica alimentos en este grupo desde Porciones.',
  },
  exchangeList: {
    ...CANONICAL.exchangeList,
    // Estado que SOLO existe en nativo: la pantalla «Porciones» del coach es una ruta propia de RN
    // (la web no tiene esa pestaña, ver el docblock de `app/coach/nutrition-v2/portions.tsx`) y es
    // el unico lugar donde un coach sin `nutrition_exchanges` choca con el 403 MODULE_OFF de
    // `api/mobile/nutrition/exchanges/_shared.ts`. Antes ese 403 se leia «No pudimos cargar la
    // lista», que culpaba a la red de una decision de modulos.
    moduleOffTitle: 'Módulo de porciones no habilitado',
    moduleOffHint: 'Activá el módulo desde Herramientas para administrar las listas.',
  },
  student: {
    ...CANONICAL.student,
    // En web el reintento es texto dentro del mismo mensaje; en nativo el snackbar tiene su
    // propia accion (`student.retry`), asi que el mensaje NO puede terminar en "Reintentar" o el
    // alumno lee la palabra dos veces.
    markFailed: 'No se pudo marcar la porción.',
  },
} as const

/** Qué pintar cuando la lista de equivalencias no carga. */
export type ExchangeListLoadState = 'module-off' | 'load-failed'

/**
 * Clasifica el error de `fetchExchangeList` (ítem 6 del tren «Arreglos chicos pre-OTA»): el 403 con
 * `code: 'MODULE_OFF'` de `api/mobile/nutrition/exchanges/_shared.ts:64-75` no es una falla de
 * carga, es el modulo apagado — y decirle «No pudimos cargar la lista» a un coach sin el modulo lo
 * manda a reintentar para siempre. Cualquier otro error sigue siendo `load-failed`.
 *
 * El chequeo es por FORMA (`name` + `code` del `ApiError` de `lib/api.ts:26-41`) y NO con
 * `instanceof` a proposito: este modulo es copy puro —lo importa `nutrition-v2-builder-portions.ts`,
 * que corre en vitest sin React Native— y arrastrar `lib/api.ts` le sumaria supabase, expo-router y
 * Sentry a toda esa cadena. `ApiError` fija `this.name = 'ApiError'` en su constructor.
 */
export function classifyExchangeListError(error: unknown): ExchangeListLoadState {
  const candidate = error as { name?: unknown; code?: unknown } | null
  return candidate?.name === 'ApiError' && candidate.code === 'MODULE_OFF' ? 'module-off' : 'load-failed'
}
