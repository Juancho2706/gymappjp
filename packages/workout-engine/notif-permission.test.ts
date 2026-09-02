import { describe, expect, it } from 'vitest'
import {
  describeNotifPermission,
  type NotifPermissionState,
  type NotifPermissionSurface,
} from './notif-permission'

const SURFACES: NotifPermissionSurface[] = ['android', 'ios', 'web']
const STATES: NotifPermissionState[] = ['granted', 'denied', 'default', 'unsupported']

describe('describeNotifPermission', () => {
  it('oculta la fila cuando el dispositivo no soporta notificaciones', () => {
    for (const surface of SURFACES) {
      expect(describeNotifPermission('unsupported', surface)).toMatchObject({
        visible: false,
        interactive: false,
        action: 'none',
      })
    }
  })

  it('concedido: interruptor encendido, sin acción (revocar es cosa del SO)', () => {
    for (const surface of SURFACES) {
      const row = describeNotifPermission('granted', surface)
      expect(row).toMatchObject({ visible: true, on: true, interactive: false, action: 'none', blocked: false })
      expect(row.status).not.toBe('')
    }
  })

  it('sin decidir: el toque pide el permiso', () => {
    for (const surface of SURFACES) {
      expect(describeNotifPermission('default', surface)).toMatchObject({
        visible: true,
        on: false,
        interactive: true,
        action: 'request',
        blocked: false,
      })
    }
  })

  it('bloqueado en RN (Android e iOS): el toque abre los ajustes de la app', () => {
    for (const surface of ['android', 'ios'] as const) {
      expect(describeNotifPermission('denied', surface)).toMatchObject({
        visible: true,
        on: false,
        interactive: true,
        action: 'open-settings',
        blocked: true,
      })
    }
  })

  it('bloqueado en web: fila visible pero sin acción (no se pueden abrir los ajustes del sitio)', () => {
    expect(describeNotifPermission('denied', 'web')).toMatchObject({
      visible: true,
      on: false,
      interactive: false,
      action: 'none',
      blocked: true,
    })
  })

  it('nunca ofrece acción sin marcar la fila como interactiva, ni al revés', () => {
    for (const surface of SURFACES) {
      for (const state of STATES) {
        const row = describeNotifPermission(state, surface)
        expect(row.interactive).toBe(row.action !== 'none')
        // Una fila que no se pinta nunca es tocable.
        if (!row.visible) expect(row.interactive).toBe(false)
      }
    }
  })

  it('cada superficie tiene su propio nombre y su copy de estado', () => {
    const android = describeNotifPermission('default', 'android')
    const web = describeNotifPermission('default', 'web')
    expect(android.label).toBe('Temporizador en la pantalla bloqueada')
    expect(web.label).toBe('Avisarme al terminar el descanso')
    expect(android.status).not.toBe(web.status)
  })

  it('el copy de Android nombra «No molestar» al estar concedido (causa nº 1 del sintoma)', () => {
    expect(describeNotifPermission('granted', 'android').status).toContain('No molestar')
  })

  // Hallazgo D-2: con una sola superficie `mobile`, la alumna de iPhone leia «...Android puede
  // ocultarlo» bajo un label que prometia el temporizador de la pantalla bloqueada — que en iOS lo
  // da la Live Activity, no este permiso.
  it('iOS no promete el temporizador de la pantalla bloqueada (lo da la Live Activity)', () => {
    expect(describeNotifPermission('default', 'ios').label).toBe('Avisarme al terminar el descanso')
    expect(describeNotifPermission('default', 'ios').label).not.toBe(
      describeNotifPermission('default', 'android').label,
    )
  })

  it('el copy de iOS no menciona «No molestar» ni «Android» en ningun estado', () => {
    for (const state of STATES) {
      const status = describeNotifPermission(state, 'ios').status
      expect(status).not.toContain('No molestar')
      expect(status).not.toContain('Android')
    }
  })
})
