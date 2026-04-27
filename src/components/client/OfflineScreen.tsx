'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    brandName: string
    logoUrl?: string
    primaryColor: string
}

export function OfflineScreen({ brandName, logoUrl, primaryColor }: Props) {
    return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background p-6 text-center">
            {/* Ambient glow */}
            <div
                className="fixed inset-0 pointer-events-none opacity-10"
                style={{
                    background: `radial-gradient(ellipse 60% 50% at 50% 40%, ${primaryColor}, transparent)`,
                }}
            />

            <div className="relative z-10 flex flex-col items-center gap-5">
                {logoUrl ? (
                    <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-border/50 shadow-lg">
                        <Image src={logoUrl} alt={brandName} fill className="object-contain p-2" />
                    </div>
                ) : (
                    <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {brandName.charAt(0)}
                    </div>
                )}

                <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <WifiOff className="w-5 h-5" />
                        <span className="text-sm font-medium">Sin conexión</span>
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                        No puedes entrenar sin internet
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-[260px]">
                        Verifica tu conexión para seguir entrenando con{' '}
                        <span className="font-semibold" style={{ color: primaryColor }}>
                            {brandName}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    )
}

/**
 * Provider que envuelve la app del alumno y muestra OfflineScreen cuando no hay red.
 */
export function NetworkProvider({ children, brandName, logoUrl, primaryColor }: Props & { children: React.ReactNode }) {
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        setIsOnline(navigator.onLine)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    if (!isOnline) {
        return <OfflineScreen brandName={brandName} logoUrl={logoUrl} primaryColor={primaryColor} />
    }

    return <>{children}</>
}
