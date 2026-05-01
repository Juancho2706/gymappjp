'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ClipboardList } from 'lucide-react'
import { CreateClientModal } from './CreateClientModal'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { LOTTIE_CLIPBOARD_LIST_URL } from '@/lib/lottie-assets'

const Player = dynamic(
    () =>
        import('@lottiefiles/react-lottie-player').then((m) => m.Player),
    { ssr: false, loading: () => (
        <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            className="flex h-40 items-center justify-center"
        >
            <ClipboardList className="h-28 w-28 text-primary/25" strokeWidth={1} />
        </motion.div>
    ) }
)

export function ClientsDirectoryEmpty() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <GlassCard className="mx-4 flex flex-col items-center justify-center py-16 text-center md:mx-0 md:py-24">
                <div className="mb-8 flex h-40 w-full max-w-xs items-center justify-center">
                    <Player autoplay loop src={LOTTIE_CLIPBOARD_LIST_URL} style={{ height: '160px' }} />
                </div>
                <h3 className="font-display text-xl font-black uppercase tracking-tighter text-foreground md:text-2xl">
                    Tu equipo te espera
                </h3>
                <p className="mt-3 max-w-md px-4 text-sm font-medium leading-relaxed text-muted-foreground">
                    Agrega tu primer alumno y empieza a transformar vidas.
                </p>
                <GlassButton
                    onClick={() => setOpen(true)}
                    className="mt-8 h-14 px-10 text-white"
                    style={{
                        backgroundColor: 'var(--theme-primary)',
                        boxShadow: '0 0 20px -5px var(--theme-primary)',
                    }}
                >
                    <span className="text-xs font-bold uppercase tracking-widest">Nuevo alumno</span>
                </GlassButton>
            </GlassCard>
            <CreateClientModal open={open} onClose={() => setOpen(false)} />
        </>
    )
}
