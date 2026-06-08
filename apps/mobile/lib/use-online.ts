import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

/**
 * Estado de conexión real (Ola 0). Reemplaza la detección por "inferencia de error"
 * que dejaba la cola offline como código muerto (comidas/series perdidas en silencio).
 * `onReconnect` permite disparar el flush de colas al volver la red.
 */
export function useOnline(onReconnect?: () => void): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    let wasOffline = false
    const unsub = NetInfo.addEventListener((state) => {
      const isUp = Boolean(state.isConnected) && state.isInternetReachable !== false
      setOnline(isUp)
      if (isUp && wasOffline) onReconnect?.()
      wasOffline = !isUp
    })
    return () => unsub()
  }, [onReconnect])
  return online
}

/** Chequeo puntual (no-hook) del estado de conexión. */
export async function checkOnline(): Promise<boolean> {
  const state = await NetInfo.fetch()
  return Boolean(state.isConnected) && state.isInternetReachable !== false
}
