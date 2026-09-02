/**
 * Hook del permiso de notificaciones del ejecutor V3 (hallazgo D, 2026-09-02).
 *
 * Cubre la máquina de estados que consume la fila «Avisarme al terminar el descanso» del sheet V3:
 * sin soporte, concesión, rechazo, relectura al volver a la pestaña y relectura al ABRIR el sheet
 * (el alumno puede haberlo cambiado en los ajustes del sitio o desde el candado, sin cambiar de
 * pestaña). El mapa estado→copy/acción se testea aparte y puro en
 * `packages/workout-engine/notif-permission.test.ts`.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotificationPermission } from './use-notification-permission'

type Perm = 'granted' | 'denied' | 'default'

const showNotification = vi.fn().mockResolvedValue(undefined)

/** Instala un `window.Notification` falso y devuelve el mock de `requestPermission`. */
function stubNotification(initial: Perm, result: Perm = initial) {
  const requestPermission = vi.fn().mockImplementation(async () => {
    ;(globalThis as unknown as { Notification: { permission: Perm } }).Notification.permission = result
    return result
  })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: { permission: initial, requestPermission },
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: { getRegistration: vi.fn().mockResolvedValue({ showNotification }) },
  })
  return requestPermission
}

/** Simula que la pestaña vuelve al frente con otro estado de permiso ya escrito por el navegador. */
function returnToTab(next: Perm) {
  ;(window as unknown as { Notification: { permission: Perm } }).Notification.permission = next
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  showNotification.mockClear()
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'Notification')
})

describe('useNotificationPermission', () => {
  it('sin soporte del navegador ⇒ "unsupported" (la fila no se pinta)', async () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'Notification')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('unsupported'))
  })

  it('lee el permiso ya concedido al montar', async () => {
    stubNotification('granted')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
  })

  it('sin decidir → concedido: promptea una vez y confirma vía service worker', async () => {
    const requestPermission = stubNotification('default', 'granted')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('default'))

    await act(async () => {
      await result.current.request()
    })

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(result.current.permission).toBe('granted')
    // `new Notification()` lanza "Illegal constructor" en PWA Android: la confirmación SIEMPRE sale
    // por `registration.showNotification`.
    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(showNotification.mock.calls[0][0]).toBe('¡Notificaciones activadas!')
  })

  it('sin decidir → rechazado: refleja "denied" y no pinta confirmación', async () => {
    stubNotification('default', 'denied')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('default'))

    await act(async () => {
      await result.current.request()
    })

    expect(result.current.permission).toBe('denied')
    expect(showNotification).not.toHaveBeenCalled()
  })

  it('relee el permiso al volver a la pestaña (pudo cambiarlo en los ajustes del sitio)', async () => {
    stubNotification('denied')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('denied'))

    act(() => returnToTab('granted'))

    await waitFor(() => expect(result.current.permission).toBe('granted'))
  })

  // Hallazgo D-11: el sheet V3 se monta con TODA la sesion (no con `open`), asi que leer solo al
  // montar dejaba la fila congelada. En Chrome desktop el alumno destraba el permiso desde el
  // candado SIN cambiar de pestana ⇒ `visibilitychange` no dispara.
  it('relee el permiso al abrir el sheet (sin cambiar de pestana)', async () => {
    stubNotification('denied')
    const { result, rerender } = renderHook(({ open }: { open: boolean }) => useNotificationPermission(open), {
      initialProps: { open: false },
    })

    // Cerrado: ni siquiera lee (la fila no se pinta).
    expect(result.current.permission).toBeNull()

    rerender({ open: true })
    await waitFor(() => expect(result.current.permission).toBe('denied'))

    // El alumno destraba el permiso desde el candado y vuelve a abrir la tuerca.
    rerender({ open: false })
    ;(window as unknown as { Notification: { permission: Perm } }).Notification.permission = 'granted'
    rerender({ open: true })

    await waitFor(() => expect(result.current.permission).toBe('granted'))
  })

  it('sin argumento se comporta como antes (lee al montar)', async () => {
    stubNotification('granted')
    const { result } = renderHook(() => useNotificationPermission())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
  })
})
