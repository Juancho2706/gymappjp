/**
 * workout-executor-nav — helpers PUROS de los params de fecha del ejecutor RN (`/alumno/workout/[planId]`).
 *
 * Espejo del contrato de la web, con la diferencia de plataforma aislada acá: la web construye HREFs
 * (`lib/workout/executor-recovery.ts`), RN construye params de expo-router. La VALIDACIÓN de las fechas
 * no se duplica: vive en `@eva/workout-engine` (`validateTargetDate` / `resolveRepeatDate`), compartida
 * con la web.
 *
 * Convención (idéntica a web):
 *   · `?fecha=YYYY-MM-DD`     → EDITAR los registros de un día PASADO: modo solo-UPDATE del motor
 *                               (`useWorkoutSession(planId, repeatDate, editDate)`), nunca inserta.
 *   · `?repetir=YYYY-MM-DD`   → repetir HOY un día ya hecho, con las series precargadas (escribe HOY).
 *   · `?recuperar=YYYY-MM-DD` → sólo banner ámbar; el guardado es el flujo normal de HOY.
 *   · `?desde=hecho`          → tap en un día hecho HOY; el ejecutor lo ignora (flujo normal de hoy).
 *
 * Sin acceso a red ni a la fecha del sistema (`todayIso` se inyecta) ⇒ deterministas y testeables.
 */

import { resolveRepeatDate, validateTargetDate } from '@eva/workout-engine'

/** Params de fecha ya resueltos para el ejecutor: a lo sumo UNO de los dos es no-null. */
export interface ExecutorDateParams {
  /** Día PASADO a editar (modo solo-UPDATE). */
  editDate: string | null
  /** Día ya hecho que se repite HOY (semilla de valores). */
  repeatDate: string | null
}

/**
 * Resuelve `?fecha` / `?repetir` con la MISMA precedencia que la página web (page.tsx:32-41):
 *
 *  1. `fecha` válida y DISTINTA de hoy ⇒ `editDate`. Una `fecha` inválida/futura se ignora (abre normal).
 *  2. `fecha` igual a HOY se NORMALIZA a null (fix 80995cae / incidente 2026-07-26): el modo solo-UPDATE
 *     jamás debe cubrir hoy — un día recuperado hoy linkeaba `?fecha=<hoy>` y toda serie nueva moría con
 *     `past_set_not_found`. Con la fecha de hoy el upsert normal es seguro e idéntico a entrar sin param.
 *  3. Exclusión mutua: si hay `editDate`, `repetir` se DESCARTA (gana la edición). `resolveRepeatDate` ya
 *     descarta por su cuenta formato/calendario inválidos, futuro y HOY MISMO.
 */
export function resolveExecutorDateParams(
  params: { fecha?: string | null; repetir?: string | null },
  todayIso: string,
): ExecutorDateParams {
  const fecha = typeof params.fecha === 'string' ? validateTargetDate(params.fecha, todayIso) : null
  const editDate = fecha?.ok && fecha.iso !== todayIso ? fecha.iso : null
  const repeatDate = editDate ? null : resolveRepeatDate(params.repetir, todayIso)
  return { editDate, repeatDate }
}

/**
 * Params del "Revisar y editar" del sheet de doble intención (día ya hecho) — espejo RN de
 * `buildWorkoutDoneEditHref` de web (`lib/workout/executor-recovery.ts:77-87`), misma semántica:
 *
 *  · sesión de HOY (o celda de hoy) ⇒ `{ desde: 'hecho' }`: el flujo normal de hoy ya corrige la MISMA
 *    fila (upsert por día), así que `?fecha` sería no sólo innecesario sino dañino (incidente 2026-07-26).
 *  · sesión REALMENTE pasada ⇒ `{ fecha: sessionDate }`: modo solo-UPDATE de esa fecha.
 *
 * @param sessionDate Fecha REAL de la sesión (`doneOnDate` si el día se cerró en otra fecha, si no la
 *                    fecha de la celda).
 * @param todayIso    Hoy en Santiago (`getTodayInSantiago().iso`).
 * @param isTodayCell La celda es la de HOY → flujo de hoy aunque `sessionDate` esté atribuida a otro día.
 */
export function buildWorkoutDoneEditParams(
  sessionDate: string,
  todayIso: string,
  isTodayCell = false,
): Record<string, string> {
  return isTodayCell || sessionDate === todayIso ? { desde: 'hecho' } : { fecha: sessionDate }
}
