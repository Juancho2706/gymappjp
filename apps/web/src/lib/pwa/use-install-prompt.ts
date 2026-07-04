'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Evento `beforeinstallprompt` (Chromium/Android) — aún no está en lib.dom, lo tipamos a mano.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export interface UseInstallPrompt {
  /** Evento `beforeinstallprompt` diferido, o null (iOS / ya instalada / no elegible). */
  deferredPrompt: BeforeInstallPromptEvent | null
  /** True cuando se puede disparar el prompt nativo (Android/Chromium). */
  canPrompt: boolean
  isIOS: boolean
  isStandalone: boolean
  isInstalled: boolean
  /** Dispara el prompt nativo (Android). Devuelve la elección del usuario o 'unavailable'. */
  promptInstall: () => Promise<InstallOutcome>
}

// ── Singleton a nivel de módulo: UN solo listener de beforeinstallprompt/appinstalled ──
// El evento se dispara UNA vez; capturarlo dos veces (InstallPrompt + PwaNavButton) dejaba a uno
// de los consumidores sin `deferredPrompt`. Fuente única de verdad + pub/sub a los hooks montados.
let deferredPromptSingleton: BeforeInstallPromptEvent | null = null
let installedSingleton = false
let listenersAttached = false
const subscribers = new Set<() => void>()

function emit(): void {
  subscribers.forEach((fn) => fn())
}

function ensureListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Cancelamos el mini-infobar del navegador para disparar el prompt en un momento de valor.
    e.preventDefault()
    deferredPromptSingleton = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPromptSingleton = null
    installedSingleton = true
    emit()
  })
}

// Enganche lo antes posible en el cliente (captura eventos disparados antes de montar React).
// En SSR el guard de `window` lo vuelve no-op.
ensureListeners()

function detectIsIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  )
}

function detectIsStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  )
}

/**
 * Hook único de instalación PWA. Cualquier cantidad de instancias comparte el mismo `deferredPrompt`
 * (singleton de módulo); cada instancia refleja el estado vía suscripción. Escucha `appinstalled`.
 */
export function useInstallPrompt(): UseInstallPrompt {
  // Se inicializa en null/false para NO diferir del HTML de SSR (evita mismatch de hidratación);
  // el efecto sincroniza el singleton (por si el evento llegó antes de montar).
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    ensureListeners()
    const sync = () => {
      setDeferredPrompt(deferredPromptSingleton)
      setIsInstalled(installedSingleton)
    }
    subscribers.add(sync)
    sync() // toma cualquier evento capturado antes de montar

    setIsIOS(detectIsIOS())
    setIsStandalone(detectIsStandalone())
    const mql = window.matchMedia('(display-mode: standalone)')
    const onDisplayModeChange = () => setIsStandalone(detectIsStandalone())
    mql.addEventListener('change', onDisplayModeChange)

    return () => {
      subscribers.delete(sync)
      mql.removeEventListener('change', onDisplayModeChange)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const evt = deferredPromptSingleton
    if (!evt) return 'unavailable'
    await evt.prompt()
    const { outcome } = await evt.userChoice
    // Un deferredPrompt solo se puede usar una vez.
    deferredPromptSingleton = null
    if (outcome === 'accepted') installedSingleton = true
    emit()
    return outcome
  }, [])

  return {
    deferredPrompt,
    canPrompt: deferredPrompt !== null,
    isIOS,
    isStandalone,
    isInstalled: isInstalled || isStandalone,
    promptInstall,
  }
}
