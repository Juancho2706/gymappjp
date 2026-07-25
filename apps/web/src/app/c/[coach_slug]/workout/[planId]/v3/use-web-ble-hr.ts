'use client'

/**
 * Ejecutor V3 (E6.2 · Ola 6) — hook de React sobre el manejador PURO de Web Bluetooth HR
 * (`web-ble-hr.ts`). Expone estado honesto (soportado, estado de conexión, error, bpm en vivo,
 * promedio del stream, nombre del dispositivo) y las acciones `connect` / `disconnect`.
 *
 * El promedio (`avgBpm`) alimenta el auto-prellenado de `actual_avg_hr` al cerrar el bloque; el bpm en
 * vivo (`bpm`) alimenta el chip de zona. Nada se persiste aquí: el motor de guardado tipado de siempre
 * (LogSetForm) sigue siendo la única vía de escritura.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    averageBpm,
    connectHeartRate,
    isWebBleHrSupported,
    type HrConnectionHandle,
    type HrErrorKind,
    type HrStatus,
} from './web-ble-hr'

export interface UseWebBleHr {
    /** El navegador soporta Web Bluetooth HR (Chrome/Edge Android). Si es false, no montar UI de sensor. */
    supported: boolean
    status: HrStatus
    error: HrErrorKind | null
    /** Último bpm recibido (null si aún no llega o no hay conexión). */
    bpm: number | null
    /** Promedio entero del stream de la sesión (para auto-prellenar `actual_avg_hr`). */
    avgBpm: number | null
    /** Cantidad de muestras utilizables acumuladas. */
    sampleCount: number
    deviceName: string | null
    /** El sensor reporta que perdió contacto con la piel (bpm dudoso). */
    contactLost: boolean
    connect: () => void
    disconnect: () => void
}

export function useWebBleHr(): UseWebBleHr {
    // Feature-detect una sola vez, tras montar (evita mismatch SSR/CSR: en el server navigator no existe).
    const [supported, setSupported] = useState(false)
    const [status, setStatus] = useState<HrStatus>('idle')
    const [error, setError] = useState<HrErrorKind | null>(null)
    const [bpm, setBpm] = useState<number | null>(null)
    const [deviceName, setDeviceName] = useState<string | null>(null)
    const [contactLost, setContactLost] = useState(false)
    const [samples, setSamples] = useState<number[]>([])

    const handleRef = useRef<HrConnectionHandle | null>(null)
    const mountedRef = useRef(true)

    useEffect(() => {
        setSupported(isWebBleHrSupported())
        return () => {
            mountedRef.current = false
            handleRef.current?.disconnect()
            handleRef.current = null
        }
    }, [])

    const disconnect = useCallback(() => {
        handleRef.current?.disconnect()
        handleRef.current = null
        if (!mountedRef.current) return
        setStatus('idle')
        setBpm(null)
        setContactLost(false)
    }, [])

    const connect = useCallback(() => {
        // Reinicio limpio: si había una conexión, ciérrala antes de abrir el selector de nuevo.
        handleRef.current?.disconnect()
        handleRef.current = null
        setError(null)
        setSamples([])
        setBpm(null)
        setContactLost(false)

        void connectHeartRate({
            onStatus: (next) => {
                if (mountedRef.current) setStatus(next)
            },
            onError: (kind) => {
                if (mountedRef.current) setError(kind)
            },
            onDeviceName: (name) => {
                if (mountedRef.current) setDeviceName(name)
            },
            onBpm: (sample) => {
                if (!mountedRef.current) return
                setBpm(sample.bpm)
                setContactLost(sample.contactSupported && !sample.contactDetected)
                setSamples((prev) => (prev.length >= 5000 ? prev : [...prev, sample.bpm]))
            },
        }).then((handle) => {
            // Si el hook se desmontó mientras se abría el selector, cierra de inmediato.
            if (!mountedRef.current) {
                handle?.disconnect()
                return
            }
            handleRef.current = handle
        })
    }, [])

    return {
        supported,
        status,
        error,
        bpm,
        avgBpm: averageBpm(samples),
        sampleCount: samples.length,
        deviceName,
        contactLost,
        connect,
        disconnect,
    }
}
