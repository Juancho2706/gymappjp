import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import {
  getAndroidHealthAvailability,
  HEALTH_ERROR_COPY,
  HEALTH_PROVIDER_INSTALL_COPY,
  HEALTH_PROVIDER_STORE_URL,
  HEALTH_PROVIDER_STORE_WEB_URL,
  isHealthAvailable,
  requestHealthPermissionsDetailed,
} from './health-aggregators'
import { getHealthOptIn, setHealthOptIn } from './health-prefs'
import { toast } from '../components/Toast'

/**
 * Conexión del alumno con el agregador de salud del sistema (Apple Salud / Health Connect).
 *
 * POR QUE ES UN HOOK: el flujo de opt-in (aviso previo → permisos nativos → persistir preferencia)
 * vivía SOLO dentro de `HabitsCard`, un card del inicio del alumno que además exige que la fecha
 * seleccionada sea HOY. App Review rechazó la app por guideline 2.5.1 justamente por eso: la
 * funcionalidad de HealthKit existía pero no era identificable en la UI. Ahora el mismo flujo lo
 * consume además la pantalla dedicada `/alumno/salud`, alcanzable siempre desde Perfil.
 *
 * SOLO LECTURA: nunca se piden permisos de escritura. Ver `health-aggregators.ts`.
 */

/** Nombre de la app de salud del sistema, para copy. */
export const HEALTH_APP_NAME = Platform.OS === 'ios' ? 'Apple Salud' : 'Health Connect'

export type HealthConnection = {
  /** ¿El binario trae el módulo nativo del agregador? false en Expo Go / web. */
  available: boolean
  /** ¿El alumno ya autorizó y dejó la preferencia encendida en este dispositivo? */
  optIn: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

export function useHealthConnection(callbacks?: {
  onConnected?: () => void
  onDisconnected?: () => void
}): HealthConnection {
  const available = isHealthAvailable()
  const [optIn, setOptIn] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const onConnected = callbacks?.onConnected
  const onDisconnected = callbacks?.onDisconnected

  useEffect(() => {
    let alive = true
    void getHealthOptIn().then((v) => {
      if (alive) setOptIn(v)
    })
    return () => {
      alive = false
    }
  }, [])

  // QA3: pedir permisos abre la app de Salud del sistema y eso, sin aviso, se siente como que EVA
  // "te expulsa". Se avisa ANTES y el flujo entero está blindado (toast en error, spinner siempre
  // liberado) para que ningún fallo nativo deje el botón colgado en "Conectando…".
  const connect = useCallback(async () => {
    if (connecting) return
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        `Conectar con ${HEALTH_APP_NAME}`,
        `Te vamos a llevar a ${Platform.OS === 'ios' ? 'Salud' : 'Health Connect'} para autorizar el acceso a tus pasos y horas de sueño. Volvés a EVA al terminar.`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continuar', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      )
    })
    if (!proceed) return

    setConnecting(true)
    try {
      if (Platform.OS === 'android') {
        const availability = await getAndroidHealthAvailability()
        if (availability !== 'available') {
          // Android <=13 no trae Health Connect de fábrica: explicar ANTES de mandar a Play Store
          // (QA4: el salto sin contexto se sentía como un bug).
          Alert.alert(HEALTH_PROVIDER_INSTALL_COPY.title, HEALTH_PROVIDER_INSTALL_COPY.body, [
            { text: 'Ahora no', style: 'cancel' },
            {
              text: HEALTH_PROVIDER_INSTALL_COPY.cta,
              onPress: () => {
                Linking.openURL(HEALTH_PROVIDER_STORE_URL).catch(() => {
                  Linking.openURL(HEALTH_PROVIDER_STORE_WEB_URL).catch(() => {})
                })
              },
            },
          ])
          return
        }
      }
      const res = await requestHealthPermissionsDetailed()
      if (!res.ok) {
        toast.error(HEALTH_ERROR_COPY[res.reason] ?? `No se pudo conectar con ${HEALTH_APP_NAME}`)
        return
      }
      await setHealthOptIn(true)
      setOptIn(true)
      onConnected?.()
    } catch (e) {
      console.warn('[health] connect failed', e)
      toast.error(`No se pudo conectar con ${HEALTH_APP_NAME}`)
    } finally {
      setConnecting(false)
    }
  }, [connecting, onConnected])

  const disconnect = useCallback(async () => {
    await setHealthOptIn(false)
    setOptIn(false)
    onDisconnected?.()
  }, [onDisconnected])

  return { available, optIn, connecting, connect, disconnect }
}
