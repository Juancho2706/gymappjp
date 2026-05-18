'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Share, PlusSquare } from 'lucide-react'
import Image from 'next/image'

const STORAGE_KEY = 'eva-pwa-install-dismissed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

function isEligibleMobileClient(): boolean {
  if (typeof window === 'undefined') return false
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return narrow && (coarse || mobileUa)
}

function isDismissedPersistent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function InstallPrompt({
    brandName = 'EVA',
    logoUrl,
    coachInitial = 'E',
    primaryColor = '#10B981',
}: {
    brandName?: string
    logoUrl?: string
    coachInitial?: string
    primaryColor?: string
}) {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ||
      document.referrer.includes('android-app://')
    setIsStandalone(standaloneMode)

    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as Window & { MSStream?: unknown }).MSStream
    setIsIOS(isIOSDevice)

    if (standaloneMode || isDismissedPersistent() || !isEligibleMobileClient()) {
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      if (!isEligibleMobileClient() || isDismissedPersistent()) return
      const evt = e as BeforeInstallPromptEvent
      evt.preventDefault()
      setDeferredPrompt(evt)
      setIsVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    const iosDelayTimer = isIOSDevice
      ? window.setTimeout(() => {
          if (isDismissedPersistent() || !isEligibleMobileClient()) return
          setIsVisible(true)
        }, 3000)
      : undefined

    return () => {
      if (iosDelayTimer !== undefined) window.clearTimeout(iosDelayTimer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleDismiss = () => {
    setIsVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      /* ignore quota / private mode */
    }
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setIsVisible(false)
    }
    setDeferredPrompt(null)
  }

  if (!isVisible || isStandalone) return null

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-6 left-0 right-0 z-[100] px-4 pointer-events-none flex justify-center">
          {isIOS ? (
            /* iOS Safari Instructions */
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full max-w-sm bg-card/95 backdrop-blur-xl border border-border rounded-3xl shadow-2xl p-6 pointer-events-auto relative"
            >
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-1 hover:bg-muted rounded-full transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                {logoUrl ? (
                    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-border shrink-0 bg-background">
                        <Image src={logoUrl} alt={brandName} width={48} height={48} className="object-contain p-1" />
                    </div>
                ) : (
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-lg" style={{ backgroundColor: primaryColor }}>
                        {coachInitial}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-base text-foreground leading-tight">Instalar {brandName}</h3>
                  <p className="text-xs text-muted-foreground">Úsala como una aplicación nativa</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/50 p-3 rounded-2xl">
                  <div className="w-8 h-8 flex items-center justify-center bg-background rounded-xl shrink-0 border border-border">
                    <Share className="w-4 h-4" />
                  </div>
                  <p>Toca el botón <strong>Compartir</strong> en Safari.</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/50 p-3 rounded-2xl">
                  <div className="w-8 h-8 flex items-center justify-center bg-background rounded-xl shrink-0 border border-border">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <p>
                    Selecciona <strong>{'"Añadir a inicio"'}</strong>.
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
            </motion.div>
          ) : (
            /* Android / Chrome Banner */
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full max-w-sm bg-card/95 backdrop-blur-xl border border-border rounded-[2.5rem] shadow-2xl p-4 pointer-events-auto flex items-center gap-4"
            >
              {logoUrl ? (
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border border-border shrink-0 bg-background">
                      <Image src={logoUrl} alt={brandName} width={48} height={48} className="object-contain p-1" />
                  </div>
              ) : (
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-lg" style={{ backgroundColor: primaryColor }}>
                      {coachInitial}
                  </div>
              )}

              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-extrabold text-sm text-foreground truncate">¿Instalar {brandName}?</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">Experiencia más fluida y rápida.</p>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0 items-end">
                <button
                  onClick={deferredPrompt ? handleInstallClick : handleDismiss}
                  className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-2xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95"
                >
                  {deferredPrompt ? 'Instalar' : 'Entendido'}
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-2 py-1 text-[9px] font-bold text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-widest"
                >
                  Ocultar
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  )
}
