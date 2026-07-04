'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Share, PlusSquare, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt'
import {
  hasCompletedFirstWorkout,
  isInstallPromptDismissed,
  dismissInstallPrompt,
  FIRST_WORKOUT_EVENT,
} from '@/lib/pwa/install-signals'

// Espera tras el momento de valor antes de asomar el prompt: deja respirar la celebración de fin
// de rutina y evita interrumpir. No es "al primer render" (AC-A3).
const SHOW_DELAY_MS = 2600

interface PromptBrand {
  brandName: string
  logoUrl: string | null
  primaryColor: string
  coachInitial: string
}

function isEligibleMobileClient(): boolean {
  if (typeof window === 'undefined') return false
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return narrow && (coarse || mobileUa)
}

/**
 * Lee la marca del wrapper del layout `/c` (`data-coach-slug` con `data-brand-name`,
 * `data-primary-color`, `data-logo-url`). Bajo `/c` → marca del coach; fuera de `/c` no existe
 * el wrapper → cae a EVA (props por defecto).
 */
function readBrandFromDom(fallback: PromptBrand): PromptBrand {
  if (typeof document === 'undefined') return fallback
  const el = document.querySelector('[data-coach-slug]')
  if (!el) return fallback
  const brandName = el.getAttribute('data-brand-name') || fallback.brandName
  const primaryColor = el.getAttribute('data-primary-color') || fallback.primaryColor
  const logoUrl = el.getAttribute('data-logo-url') || fallback.logoUrl
  return {
    brandName,
    primaryColor,
    logoUrl: logoUrl || null,
    coachInitial: (brandName.trim().charAt(0) || 'E').toUpperCase(),
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
  const { isIOS, isStandalone, isInstalled, canPrompt, promptInstall } = useInstallPrompt()

  const propBrand = useMemo<PromptBrand>(
    () => ({ brandName, logoUrl: logoUrl ?? null, coachInitial, primaryColor }),
    [brandName, logoUrl, coachInitial, primaryColor],
  )
  const [brand, setBrand] = useState<PromptBrand>(propBrand)
  const [isVisible, setIsVisible] = useState(false)
  // Se incrementa ante señales que ameritan reevaluar (primer workout completado, retorno a la pestaña).
  const [tick, setTick] = useState(0)

  // Reevaluar cuando el flujo de exec dispara "primer workout completado" (in-session, sin recargar)
  // o cuando la pestaña vuelve a estar visible (returning users).
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump()
    }
    window.addEventListener(FIRST_WORKOUT_EVENT, bump)
    window.addEventListener('pageshow', bump)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(FIRST_WORKOUT_EVENT, bump)
      window.removeEventListener('pageshow', bump)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const eligible = useMemo(() => {
    if (isStandalone || isInstalled) return false
    if (!isEligibleMobileClient()) return false
    if (isInstallPromptDismissed()) return false
    if (!hasCompletedFirstWorkout()) return false
    // Android: sólo si hay prompt nativo que disparar. iOS: siempre por instrucciones manuales.
    return isIOS || canPrompt
    // `tick` (en deps) fuerza la reevaluación aunque las señales de localStorage no sean reactivas.
  }, [isStandalone, isInstalled, isIOS, canPrompt, tick])

  useEffect(() => {
    if (!eligible) {
      setIsVisible(false)
      return
    }
    setBrand(readBrandFromDom(propBrand))
    const timer = window.setTimeout(() => setIsVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [eligible, propBrand])

  const handleDismiss = () => {
    setIsVisible(false)
    dismissInstallPrompt()
  }

  const handleInstallClick = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted' || outcome === 'unavailable') {
      setIsVisible(false)
    }
  }

  if (!isVisible || isInstalled || isStandalone) return null

  const { brandName: name, logoUrl: logo, coachInitial: initial, primaryColor: color } = brand
  const logoTile = logo ? (
    <div className="w-12 h-12 rounded-2xl overflow-hidden border border-border shrink-0 bg-background shadow-sm">
      <Image
        src={logo}
        alt={name}
        width={48}
        height={48}
        className="object-contain p-1"
        style={{ width: 48, height: 48 }}
      />
    </div>
  ) : (
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-black text-lg shadow-sm"
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  )

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed bottom-6 left-0 right-0 z-[100] px-4 pb-safe pointer-events-none flex justify-center">
          {isIOS ? (
            /* iOS Safari — sin beforeinstallprompt: hoja de instrucciones (flujo iOS 26) */
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="w-full max-w-sm bg-card/95 backdrop-blur-xl border border-border rounded-[2rem] shadow-2xl p-6 pointer-events-auto relative overflow-hidden"
            >
              {/* Resplandor de marca */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25"
                style={{ backgroundColor: color }}
              />
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full transition-colors z-10"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-4 mb-5 relative">
                {logoTile}
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-extrabold text-base text-foreground leading-tight truncate">
                    Instalar {name}
                  </h3>
                  <p className="text-xs text-muted-foreground">Tenela en tu inicio como app</p>
                </div>
              </div>

              <div className="space-y-2.5 relative">
                <div className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/50 p-3 rounded-2xl">
                  <div className="w-8 h-8 flex items-center justify-center bg-background rounded-xl shrink-0 border border-border">
                    <Share className="w-4 h-4" />
                  </div>
                  <p>
                    Toca <strong>Compartir</strong> en Safari.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/50 p-3 rounded-2xl">
                  <div className="w-8 h-8 flex items-center justify-center bg-background rounded-xl shrink-0 border border-border">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <p>
                    Elegí <strong>{'"Añadir a inicio"'}</strong>.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm text-foreground/80 bg-muted/50 p-3 rounded-2xl">
                  <div
                    className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 text-white"
                    style={{ backgroundColor: color }}
                  >
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <p>
                    Dejá activado <strong>{'"Abrir como app"'}</strong> y toca <strong>Añadir</strong>.
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
            </motion.div>
          ) : (
            /* Android / Chromium — beforeinstallprompt capturado */
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="w-full max-w-sm bg-card/95 backdrop-blur-xl border border-border rounded-[2.25rem] shadow-2xl p-4 pointer-events-auto relative overflow-hidden"
            >
              {/* Filo de acento con el color del coach */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: color }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-14 -left-8 w-36 h-36 rounded-full blur-3xl opacity-20"
                style={{ backgroundColor: color }}
              />
              <div className="flex items-center gap-4 relative">
                {logoTile}
                <div className="flex-1 min-w-0 pr-1">
                  <h3 className="font-display font-extrabold text-sm text-foreground truncate">
                    Instalar {name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Acceso directo, más rápido y sin navegador.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 shrink-0 items-end">
                  <button
                    onClick={handleInstallClick}
                    className="px-5 py-2.5 text-xs font-bold rounded-2xl shadow-lg transition-all active:scale-95"
                    style={{
                      // Bajo /c usa el acento de marca legible (resuelto por el layout); fuera de /c
                      // cae al color crudo. `--theme-primary-foreground` garantiza contraste del texto.
                      backgroundColor: `var(--theme-primary, ${color})`,
                      color: 'var(--theme-primary-foreground, #fff)',
                      boxShadow: `0 8px 20px -8px ${color}`,
                    }}
                  >
                    Instalar
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-widest"
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  )
}
