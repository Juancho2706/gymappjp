'use client'

/**
 * Ejecutor V3 (E6.2 · Ola 6) — sheet "Conectar sensor de pulso". Traducción del mockup
 * `concepto-a-v32-momentos` (pantalla 3): radar de anillos que laten desde un corazón mientras busca,
 * CTA "Conectar", y nota HONESTA (Bluetooth estándar cubre cintas/relojes; Apple Watch y Galaxy Watch
 * llegan con la app del reloj — informe R7).
 *
 * Realidad de Web Bluetooth: el emparejamiento lo hace el SELECTOR NATIVO del navegador (no podemos
 * pintar una lista de dispositivos escaneados sin flags). Por eso el sheet muestra el radar + la CTA que
 * abre ese selector, y —una vez conectado— la tarjeta del sensor con el BPM en vivo. Estados de error
 * honestos (cancelado, permiso denegado, conexión perdida); jamás se inventa pulso.
 *
 * Se monta DENTRO del wrapper [data-exec-v3] (acento --exec-brand ya resuelto), sin portal, igual que
 * `ExecSettingsSheet`.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bluetooth, HeartPulse, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HrZoneRange } from '@eva/cardio'
import type { UseWebBleHr } from './use-web-ble-hr'
import { zoneFromRanges } from './web-ble-hr'

const ERROR_COPY: Record<string, string> = {
    unsupported: 'Tu navegador no permite conectar sensores por Bluetooth.',
    cancelled: 'No se eligió ningún sensor. Enciende la cinta o el reloj y vuelve a intentar.',
    denied: 'Permiso de Bluetooth denegado. Habilítalo en el navegador para conectar tu sensor.',
    'connection-lost': 'Se perdió la conexión con el sensor. Acércalo y vuelve a conectar.',
    gatt: 'No pudimos leer el sensor. Verifica que transmita en Bluetooth estándar e intenta de nuevo.',
}

interface SensorSheetV3Props {
    open: boolean
    onClose: () => void
    hr: UseWebBleHr
    /** Rangos de zona resueltos del alumno (cardio.zones) — para etiquetar el bpm en vivo con su zona. */
    zones: HrZoneRange[] | null
}

export function SensorSheetV3({ open, onClose, hr, zones }: SensorSheetV3Props) {
    const reducedMotion = useReducedMotion()
    const { status, error, bpm, deviceName, contactLost, connect, disconnect } = hr

    const isConnected = status === 'connected'
    const isBusy = status === 'requesting' || status === 'connecting' || status === 'reconnecting'
    const liveZone = bpm != null ? zoneFromRanges(bpm, zones) : null

    const statusText =
        status === 'requesting'
            ? 'Elige tu sensor en el selector del navegador…'
            : status === 'connecting'
              ? 'Conectando…'
              : status === 'reconnecting'
                ? 'Se perdió la señal — reconectando…'
                : 'Enciende tu cinta o reloj y toca Conectar.'

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Cerrar conexión de sensor"
                        onClick={onClose}
                        className="exec-v3-sheet-scrim"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                    />
                    <motion.div
                        className="exec-v3-settings exec-v3-sensor"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Conectar sensor de pulso"
                        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                    >
                        <span className="exec-v3-handle" aria-hidden />
                        <div className="exec-v3-settings-hd">
                            <h2 className="exec-v3-settings-t">Conectar sensor de pulso</h2>
                            <button type="button" onClick={onClose} className="exec-v3-settings-x" aria-label="Cerrar">
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        </div>

                        {/* Radar honesto: anillos que laten desde el corazón mientras busca/conecta. */}
                        <div className={cn('exec-v3-radar', (isBusy || isConnected) && 'is-live')} aria-hidden>
                            <span className="exec-v3-radar-wave" />
                            <span className="exec-v3-radar-wave" />
                            <span className="exec-v3-radar-wave" />
                            <span className="exec-v3-radar-core">
                                <HeartPulse className="h-6 w-6" />
                            </span>
                        </div>

                        {isConnected ? (
                            <>
                                {/* Sensor conectado + BPM en vivo con zona. */}
                                <div className="exec-v3-dev is-on">
                                    <span className="exec-v3-dev-ico" aria-hidden>
                                        <HeartPulse className="h-5 w-5" />
                                    </span>
                                    <span className="exec-v3-dev-mid">
                                        <span className="exec-v3-dev-name">{deviceName ?? 'Sensor de pulso'}</span>
                                        <span className="exec-v3-dev-sub">
                                            <span className="exec-v3-ble">BLE</span>
                                            {contactLost ? 'Ajusta el sensor · sin contacto' : 'Conectado · en vivo'}
                                        </span>
                                    </span>
                                    {bpm != null ? (
                                        <span
                                            className="exec-v3-dev-bpm tabular-nums"
                                            style={
                                                liveZone
                                                    ? ({ '--zc': `var(--zone-z${liveZone.zone})` } as React.CSSProperties)
                                                    : undefined
                                            }
                                        >
                                            <b>{bpm}</b>
                                            <span className="exec-v3-dev-bpmlbl">{liveZone ? `Z${liveZone.zone} · bpm` : 'bpm'}</span>
                                        </span>
                                    ) : (
                                        <span className="exec-v3-dev-bpm exec-v3-dev-bpm-wait">
                                            <span className="exec-v3-dev-bpmlbl">leyendo…</span>
                                        </span>
                                    )}
                                </div>

                                <div className="exec-v3-sensor-note">
                                    <HeartPulse className="h-4 w-4 shrink-0" aria-hidden />
                                    <span>
                                        Tu <b>FC promedio</b> se rellena sola al registrar la serie — siempre editable.
                                    </span>
                                </div>

                                <button type="button" onClick={disconnect} className="exec-v3-sensor-disconnect">
                                    Desconectar sensor
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="exec-v3-sensor-status">{statusText}</p>
                                {status === 'error' && error && (
                                    <p className="exec-v3-sensor-err" role="status">
                                        {ERROR_COPY[error] ?? ERROR_COPY.gatt}
                                    </p>
                                )}

                                <button
                                    type="button"
                                    onClick={connect}
                                    disabled={isBusy}
                                    className="exec-v3-juicy exec-v3-sensor-cta"
                                >
                                    <Bluetooth className="h-5 w-5" aria-hidden />
                                    {isBusy ? 'Buscando…' : status === 'error' ? 'Reintentar' : 'Conectar'}
                                </button>

                                <div className="exec-v3-sensor-note">
                                    <span>
                                        Cintas y relojes compatibles (<b>Bluetooth estándar</b>) · Apple Watch y Galaxy Watch
                                        llegan con la app del reloj.
                                    </span>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
