/**
 * Tercer estado del ejecutor: ERROR DE CARGA (Sentry EVA-MOBILE-9).
 *
 * Lo que cuida esta suite: que `classifyPlanLoad` NO vuelva a mezclar "no hay plan" con "no llegué al
 * servidor". Con supabase-js 2.x un corte de red en `maybeSingle()` no lanza — resuelve
 * `{ data: null, error, status: 0 }` — igual que un RLS/4xx y que un plan realmente vacío, así que el
 * viejo `if (!data)` mandaba a los tres a la pantalla «Rutina sin ejercicios · tu coach probablemente
 * esté actualizando tu plan». El alumno sin señal leía un diagnóstico falso sobre su coach.
 *
 * Se importa SOLO el helper puro (`apps/mobile/lib/workout-load-state`): el hook arrastra react-native,
 * NetInfo y el cliente de Supabase, que no bootean bajo vitest.
 */
import { describe, expect, it } from 'vitest'
import { classifyPlanLoad, isNetworkFailureMessage } from '../../apps/mobile/lib/workout-load-state'

/** Fila mínima como la que devuelve el select del plan. */
const PLAN_ROW = { id: 'plan-1', title: 'Empuje A', workout_blocks: [] }

describe('classifyPlanLoad · el vacío real vs el fallo de carga', () => {
  it('data presente ⇒ ok', () => {
    expect(classifyPlanLoad({ data: PLAN_ROW, error: null, status: 200 })).toBe('ok')
  })

  it('data null SIN error ⇒ empty (el plan no existe / quedó sin bloques: vacío honesto)', () => {
    expect(classifyPlanLoad({ data: null, error: null, status: 200 })).toBe('empty')
  })

  it('error status 0 «Failed to fetch» ⇒ offline (jamás «Rutina sin ejercicios»)', () => {
    expect(
      classifyPlanLoad({
        data: null,
        error: { message: 'TypeError: Failed to fetch', code: '' },
        status: 0,
      }),
    ).toBe('offline')
  })

  it('TypeError «Network request failed» lanzado (RN) ⇒ offline', () => {
    expect(classifyPlanLoad({ thrown: new TypeError('Network request failed') })).toBe('offline')
  })

  it('401 de sesión ⇒ error, no offline', () => {
    expect(
      classifyPlanLoad({
        data: null,
        error: { message: 'JWT expired', code: 'PGRST301' },
        status: 401,
      }),
    ).toBe('error')
  })

  it('42501 (RLS) ⇒ error, no offline', () => {
    expect(
      classifyPlanLoad({
        data: null,
        error: { message: 'permission denied for table workout_plans', code: '42501' },
        status: 403,
      }),
    ).toBe('error')
  })

  it('una excepción que NO habla de red ⇒ error', () => {
    expect(classifyPlanLoad({ thrown: new Error('Cannot read properties of undefined') })).toBe('error')
  })

  it('timeout ⇒ offline (el fetch no llegó a contestar)', () => {
    expect(classifyPlanLoad({ data: null, error: { message: 'Request timeout' }, status: 0 })).toBe('offline')
  })
})

describe('isNetworkFailureMessage', () => {
  it('reconoce las marcas de transporte caído de RN y del navegador', () => {
    expect(isNetworkFailureMessage(new TypeError('Network request failed'))).toBe(true)
    expect(isNetworkFailureMessage('TypeError: Failed to fetch')).toBe(true)
    expect(isNetworkFailureMessage({ message: 'Load failed' })).toBe(true)
  })

  it('no confunde un error de permisos con uno de red', () => {
    expect(isNetworkFailureMessage({ message: 'permission denied for table workout_plans' })).toBe(false)
    expect(isNetworkFailureMessage(null)).toBe(false)
    expect(isNetworkFailureMessage(undefined)).toBe(false)
  })
})
