// Full-bleed dark wrapper for enterprise login
// RN equivalent: KeyboardAvoidingView + SafeAreaView + LinearGradient background

import Image from 'next/image'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { ShieldCheck } from 'lucide-react'

interface EnterpriseLoginShellProps {
  children: React.ReactNode
}

export function EnterpriseLoginShell({ children }: EnterpriseLoginShellProps) {
  return (
    <div
      className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-safe pb-safe overflow-hidden"
      style={{ backgroundColor: '#09090b', color: '#f4f4f5' }}
    >
      {/* Gradient mesh background */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 70% 5%, rgba(245,158,11,0.10), transparent),
            radial-gradient(ellipse 40% 40% at 20% 85%, rgba(251,191,36,0.05), transparent)
          `,
        }}
      />

      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm sm:max-w-[400px]">
        {/* Top logo + badge */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <Image src={BRAND_APP_ICON} alt="" width={36} height={36} className="rounded-xl" priority />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight text-zinc-100">EVA</span>
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400">
                Enterprise
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="h-3 w-3 text-zinc-600" aria-hidden />
              <span className="text-[10px] text-zinc-600">Sesión MFA · Cookies aisladas</span>
            </div>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl border border-zinc-800 p-6 sm:p-8 backdrop-blur-sm"
          style={{
            background: 'rgba(24,24,27,0.7)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
