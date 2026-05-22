'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Home, Dumbbell, Apple, Camera, BookOpen } from 'lucide-react'
import { MOVIDA_BRAND } from '../_mock'

const NAV_ITEMS = [
    { href: '/movidatest/cliente/dashboard', label: 'Inicio', icon: Home },
    { href: '/movidatest/cliente/workout', label: 'Entreno', icon: Dumbbell },
    { href: '/movidatest/cliente/nutrition', label: 'Nutrición', icon: Apple },
    { href: '/movidatest/cliente/check-in', label: 'Check-in', icon: Camera },
    { href: '/movidatest/cliente/workout-history', label: 'Historial', icon: BookOpen },
]

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="flex items-start justify-center min-h-dvh bg-zinc-950">
            {/* Desktop: iPhone frame */}
            <div className="hidden lg:flex flex-col items-center justify-center min-h-dvh py-6 px-4 gap-4">
                <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                    App del alumno · vista en celular
                </p>
                <div
                    className="relative w-[393px] rounded-[3rem] border-[12px] border-zinc-800 bg-background overflow-hidden shadow-2xl shadow-black/60 flex flex-col"
                    style={{ height: '852px', boxShadow: '0 0 0 1px rgba(255,255,255,0.05) inset, 0 40px 80px -20px rgba(0,0,0,0.8)' }}
                >
                    {/* Status bar mock */}
                    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] font-semibold text-foreground shrink-0 z-10">
                        <span>9:41</span>
                        <div className="w-24 h-5 bg-background rounded-full absolute left-1/2 -translate-x-1/2 top-0" />
                        <span>●●●</span>
                    </div>
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        {children}
                    </div>
                    {/* Bottom nav */}
                    <div className="shrink-0 border-t border-border bg-card px-2 pt-2 pb-5">
                        <div className="flex items-center justify-around">
                            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                                const active = pathname === href || (href !== '/movidatest/cliente/dashboard' && pathname.startsWith(href))
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        className="flex flex-col items-center gap-0.5 px-3 py-1"
                                    >
                                        <Icon className={`w-5 h-5 ${active ? 'text-teal-500' : 'text-muted-foreground'}`}
                                            style={active ? { color: MOVIDA_BRAND.primaryColor } : undefined}
                                        />
                                        <span className={`text-[9px] ${active ? 'font-semibold' : 'text-muted-foreground'}`}
                                            style={active ? { color: MOVIDA_BRAND.primaryColor } : undefined}
                                        >
                                            {label}
                                        </span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile: full screen */}
            <div className="lg:hidden flex flex-col min-h-dvh w-full bg-background">
                {/* Header with Movida brand */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
                    <Image src="/logomovida.png" alt="Movida" width={80} height={28} className="h-7 w-auto object-contain" />
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}>
                        MG
                    </div>
                </header>
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
                {/* Bottom nav */}
                <div className="border-t border-border bg-card px-2 pt-2 pb-safe">
                    <div className="flex items-center justify-around">
                        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                            const active = pathname === href || (href !== '/movidatest/cliente/dashboard' && pathname.startsWith(href))
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className="flex flex-col items-center gap-0.5 px-3 py-1"
                                >
                                    <Icon className={`w-5 h-5 ${active ? '' : 'text-muted-foreground'}`}
                                        style={active ? { color: MOVIDA_BRAND.primaryColor } : undefined}
                                    />
                                    <span className={`text-[9px] ${active ? 'font-semibold' : 'text-muted-foreground'}`}
                                        style={active ? { color: MOVIDA_BRAND.primaryColor } : undefined}
                                    >
                                        {label}
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
