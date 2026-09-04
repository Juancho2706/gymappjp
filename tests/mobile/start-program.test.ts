/**
 * «Empezar hoy» del alumno RN — `apps/mobile/lib/start-program.ts` (tren «Ciclo real y por lado»,
 * tarea W3.1; casos S1-S9 de TESTING-QA §4.2).
 *
 * Qué se blinda:
 *   - la firma NO tiene fecha (R24 + R14): `p_start_date` viaja SIEMPRE en `null` y la RPC resuelve
 *     hoy (Santiago) server-side. Un date-picker en cliente sería un `start_date_out_of_range` que
 *     el alumno no puede interpretar;
 *   - se lee la FILA entera de un `RETURNS TABLE` (PostgREST devuelve un arreglo), y `end_date` sale
 *     tal cual del server: nunca se recalcula en cliente (R21);
 *   - `program_started_by_client` se emite SÓLO con `started = true` (R23) — la RPC es idempotente,
 *     así que el auto-start de cada serie no puede contar el evento dos veces;
 *   - los 4 errores de la RPC llegan como MENSAJE PELADO y salen como resultado DISCRIMINADO, jamás
 *     como excepción: el ejecutor llama a esta función DESPUÉS de guardar la serie y un throw acá
 *     rompería el guardado que ya estaba hecho.
 *
 * GOTCHA de resolución (patrón de `coach-branding-rpc.test.ts`): los módulos de `apps/mobile` se
 * mockean por PATH ABSOLUTO tal como los ve `apps/mobile`, con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STUDENT_ACCESS_COPY } from '../../apps/mobile/lib/student-access-copy'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type RpcResult = { data: unknown; error: unknown }

/** Monta el módulo con la RPC y la analítica mockeadas. `throws` simula la red caída (RN lanza). */
async function setup(result: RpcResult | { throws: unknown }) {
  const rpc = vi.fn(async () => {
    if ('throws' in result) throw result.throws
    return result
  })
  const captureAppEvent = vi.fn()

  vi.resetModules()
  vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: { rpc } }))
  vi.doMock(mobileLib('analytics.ts'), () => ({ captureAppEvent }))

  const mod = (await import(mobileLib('start-program.ts'))) as typeof import('../../apps/mobile/lib/start-program')
  return { ...mod, rpc, captureAppEvent }
}

/** Fila del `RETURNS TABLE (start_date, end_date, started)` tal como la entrega PostgREST. */
const ROW = (over?: Partial<{ start_date: string; end_date: string; started: boolean }>) => [
  { start_date: '2026-09-03', end_date: '2026-09-30', started: true, ...over },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('startWorkoutProgram · contrato de la RPC', () => {
  it('S1 · llama la RPC con el programa y `p_start_date: null`, y lee la fila entera', async () => {
    const { startWorkoutProgram, rpc } = await setup({ data: ROW(), error: null })

    const res = await startWorkoutProgram('prog-1')

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('client_start_workout_program', {
      p_program_id: 'prog-1',
      p_start_date: null,
    })
    expect(res).toEqual({ ok: true, startDate: '2026-09-03', endDate: '2026-09-30', started: true })
  })

  it('S8/S9 · `end_date` sale del server tal cual y no hay dónde pasar una fecha', async () => {
    const { startWorkoutProgram, rpc } = await setup({
      data: ROW({ end_date: '2026-11-11' }),
      error: null,
    })

    const res = await startWorkoutProgram('prog-1')

    // El cliente NO recalcula `start + weeks*7 - 1`: imprime lo persistido (R21).
    expect(res).toMatchObject({ ok: true, endDate: '2026-11-11' })
    // R24: el payload tiene exactamente dos claves y la fecha siempre es null.
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(args).sort()).toEqual(['p_program_id', 'p_start_date'])
    expect(args.p_start_date).toBeNull()
  })

  it('acepta también una fila suelta (no-arreglo) sin inventar datos', async () => {
    const { startWorkoutProgram } = await setup({
      data: { start_date: '2026-09-03', end_date: null, started: false },
      error: null,
    })

    expect(await startWorkoutProgram('prog-1')).toEqual({
      ok: true,
      startDate: '2026-09-03',
      endDate: null,
      started: false,
    })
  })

  it('respuesta vacía / sin `start_date` ⇒ error `unknown`, nunca una fecha inventada', async () => {
    const { startWorkoutProgram, captureAppEvent } = await setup({ data: [], error: null })

    const res = await startWorkoutProgram('prog-1')

    expect(res).toEqual({ ok: false, code: 'unknown', message: expect.any(String) })
    expect(captureAppEvent).not.toHaveBeenCalled()
  })
})

describe('startWorkoutProgram · evento program_started_by_client (R23)', () => {
  it('S2 · con `started: true` emite el evento con via `button` por default', async () => {
    const { startWorkoutProgram, captureAppEvent } = await setup({ data: ROW(), error: null })

    await startWorkoutProgram('prog-1', { structure: 'cycle' })

    expect(captureAppEvent).toHaveBeenCalledTimes(1)
    expect(captureAppEvent).toHaveBeenCalledWith('program_started_by_client', {
      program_id: 'prog-1',
      structure: 'cycle',
      via: 'button',
    })
  })

  it('el auto-start del ejecutor viaja como via `auto`', async () => {
    const { startWorkoutProgram, captureAppEvent } = await setup({ data: ROW(), error: null })

    await startWorkoutProgram('prog-1', { via: 'auto', structure: 'weekly' })

    expect(captureAppEvent).toHaveBeenCalledWith('program_started_by_client', {
      program_id: 'prog-1',
      structure: 'weekly',
      via: 'auto',
    })
  })

  it('S2/S3 · con `started: false` (el programa YA tenía fecha) devuelve OK y NO emite evento', async () => {
    const { startWorkoutProgram, captureAppEvent } = await setup({
      data: ROW({ start_date: '2026-08-20', end_date: '2026-09-16', started: false }),
      error: null,
    })

    const res = await startWorkoutProgram('prog-1')

    // R28: la idempotencia no es un error — devuelve la fecha vigente.
    expect(res).toEqual({ ok: true, startDate: '2026-08-20', endDate: '2026-09-16', started: false })
    expect(captureAppEvent).not.toHaveBeenCalled()
  })
})

describe('startWorkoutProgram · errores tipados (mensaje pelado + includes)', () => {
  it('S4 · `program_not_startable` ⇒ error tipado, sin crash ni fecha inventada', async () => {
    const { startWorkoutProgram, captureAppEvent } = await setup({
      data: null,
      error: { code: '42501', message: 'program_not_startable', details: null, hint: null },
    })

    const res = await startWorkoutProgram('prog-ajeno')

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('program_not_startable')
      expect(res.message.length).toBeGreaterThan(0)
    }
    expect(captureAppEvent).not.toHaveBeenCalled()
  })

  it('S7 · `coach_account_paused` se diferencia de S4 y usa el copy de siempre', async () => {
    const { startWorkoutProgram } = await setup({
      data: null,
      error: { code: '42501', message: 'coach_account_paused' },
    })

    const res = await startWorkoutProgram('prog-1')

    expect(res).toEqual({
      ok: false,
      code: 'coach_account_paused',
      // Mismo texto que el rebote de un guardado de serie (DATA-SECURITY §2.3), no un literal nuevo.
      message: STUDENT_ACCESS_COPY.pausedWriteError,
    })
  })

  it('`start_date_out_of_range` y `unauthenticated` también salen tipados', async () => {
    const fuera = await setup({ data: null, error: { code: '22007', message: 'start_date_out_of_range' } })
    expect(await fuera.startWorkoutProgram('prog-1')).toMatchObject({ code: 'start_date_out_of_range' })

    const anon = await setup({ data: null, error: { code: '28000', message: 'unauthenticated' } })
    expect(await anon.startWorkoutProgram('prog-1')).toMatchObject({ code: 'unauthenticated' })
  })

  it('el código se reconoce aunque venga envuelto en el texto de PostgREST o en `details`', async () => {
    const envuelto = await setup({
      data: null,
      error: { code: 'P0001', message: 'unexpected', details: 'coach_account_paused', hint: null },
    })
    expect(await envuelto.startWorkoutProgram('prog-1')).toMatchObject({ code: 'coach_account_paused' })
  })

  it('S6 · la red caída NO lanza: devuelve `unknown` para que el llamador siga su curso', async () => {
    const { startWorkoutProgram } = await setup({ throws: new TypeError('Network request failed') })

    const res = await startWorkoutProgram('prog-1')

    expect(res).toMatchObject({ ok: false, code: 'unknown' })
  })
})

describe('shouldAutoStartProgram · el auto-start de la primera serie (W3.2)', () => {
  const base = { programId: 'prog-1', flexible: true, startDate: null }

  it('S5 · programa flexible SIN fecha ⇒ arranca; con la fecha ya puesta, la 2.ª serie NO llama', async () => {
    const { shouldAutoStartProgram } = await setup({ data: ROW(), error: null })

    expect(shouldAutoStartProgram(base)).toBe(true)
    // Tras la primera llamada el ejecutor guarda la fecha devuelta ⇒ la condición se apaga sola.
    expect(shouldAutoStartProgram({ ...base, startDate: '2026-09-03' })).toBe(false)
    // Y mientras la primera llamada está EN VUELO, tampoco se dispara una segunda.
    expect(shouldAutoStartProgram({ ...base, alreadyAttempted: true })).toBe(false)
  })

  it('no arranca sin programa, sin flag flexible, ni editando un día pasado', async () => {
    const { shouldAutoStartProgram } = await setup({ data: ROW(), error: null })

    expect(shouldAutoStartProgram({ ...base, programId: null })).toBe(false)
    expect(shouldAutoStartProgram({ ...base, flexible: false })).toBe(false)
    // Flag ausente ⇒ default `false` (R13): un programa viejo nunca se auto-inicia.
    expect(shouldAutoStartProgram({ ...base, flexible: undefined })).toBe(false)
    // `?fecha=` (edición de día pasado): la RPC solo acepta HOY, así que ahí no se empieza nada.
    expect(shouldAutoStartProgram({ ...base, editDate: '2026-08-30' })).toBe(false)
  })
})
