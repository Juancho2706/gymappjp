'use client'

import { useState, useEffect } from 'react'
import { X, Smartphone } from 'lucide-react'

const DISMISSED_KEY = 'eva-app-banner-dismissed-v1'

interface Props {
    brandName: string
    primaryColor?: string
}

function isRunningInNativeApp(): boolean {
    if (typeof navigator === 'undefined') return false
    return navigator.userAgent.includes('EVANative')
}

function isRunningStandalone(): boolean {
    if (typeof window === 'undefined') return true
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    )
}

function getMobileOS(): 'ios' | 'android' | null {
    if (typeof navigator === 'undefined') return null
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios'
    if (/Android/.test(navigator.userAgent)) return 'android'
    return null
}

function isDismissed(): boolean {
    try { return localStorage.getItem(DISMISSED_KEY) === 'true' } catch { return false }
}

function dismiss(): void {
    try { localStorage.setItem(DISMISSED_KEY, 'true') } catch { /* noop */ }
}

// Placeholder store URLs — replace with real URLs in Fase 6B before submission
const IOS_STORE_URL = 'https://apps.apple.com/cl/app/eva-fitness/id6739734027'
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=cl.evaapp.eva'

export function AppDownloadBanner({ brandName, primaryColor = '#10B981' }: Props) {
    const [visible, setVisible] = useState(false)
    const [mobileOS, setMobileOS] = useState<'ios' | 'android' | null>(null)

    useEffect(() => {
        const os = getMobileOS()
        if (os && !isRunningStandalone() && !isRunningInNativeApp() && !isDismissed()) {
            setMobileOS(os)
            setVisible(true)
        }
    }, [])

    const handleDismiss = () => {
        dismiss()
        setVisible(false)
    }

    if (!visible || !mobileOS) return null

    const storeUrl = mobileOS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL
    const storeLabel = mobileOS === 'ios' ? 'App Store' : 'Google Play'

    return (
        <div
            className="fixed bottom-[var(--mobile-nav-height,60px)] left-2 right-2 z-40 rounded-2xl shadow-lg border border-border bg-card p-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300"
            role="banner"
        >
            <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: primaryColor }}
            >
                <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">Mejor en la app</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Notificaciones, offline y más
                </p>
            </div>
            <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: primaryColor }}
            >
                {storeLabel}
            </a>
            <button
                onClick={handleDismiss}
                aria-label="Cerrar"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
