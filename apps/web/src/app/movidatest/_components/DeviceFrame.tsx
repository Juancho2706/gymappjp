'use client'

import { type ReactNode } from 'react'

interface Props {
    children: ReactNode
    label?: string
}

export function DeviceFrame({ children, label = 'App del alumno en celular' }: Props) {
    return (
        <div className="hidden lg:flex flex-col items-center gap-3 min-h-dvh bg-zinc-950 py-6 px-4">
            <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                {label}
            </p>
            {/* iPhone 14 frame */}
            <div
                className="relative w-[393px] h-[852px] rounded-[3rem] border-[12px] border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60 overflow-hidden flex-shrink-0"
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05) inset, 0 40px 80px -20px rgba(0,0,0,0.8)' }}
            >
                {/* Status bar */}
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-2 text-[10px] font-semibold text-white/90 pointer-events-none">
                    <span>9:41</span>
                    <div className="w-28 h-5 bg-zinc-950 rounded-full absolute left-1/2 -translate-x-1/2 -top-1" />
                    <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 0 0-6 0zm-4-4 2 2a7.074 7.074 0 0 1 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" /></svg>
                        <svg className="w-3.5 h-2.5" viewBox="0 0 24 16" fill="currentColor"><rect x="1" y="1" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none" /><rect x="3" y="3" width="14" height="10" rx="1" fill="currentColor" /><rect x="22" y="5" width="2" height="6" rx="1" fill="currentColor" /></svg>
                    </span>
                </div>
                {/* Content area */}
                <div className="h-full w-full overflow-y-auto overflow-x-hidden pt-10">
                    {children}
                </div>
            </div>
        </div>
    )
}

// Mobile passthrough — same children, no frame
export function MobilePassthrough({ children }: { children: ReactNode }) {
    return <div className="lg:hidden min-h-dvh">{children}</div>
}
