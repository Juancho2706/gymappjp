'use client'

import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ProgramConfigForm, type ProgramConfigFieldProps } from './ProgramConfigForm'

interface ProgramConfigSheetProps extends ProgramConfigFieldProps {
    open: boolean
    onClose: () => void
    /** Desktop (md+) → slide-in derecho ~420px. Mobile (<md) → bottom sheet. */
    isMobile: boolean
}

export function ProgramConfigSheet({ open, onClose, isMobile, ...fields }: ProgramConfigSheetProps) {
    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                showCloseButton={false}
                className={isMobile
                    ? 'max-h-[88dvh] data-[side=bottom]:h-[88dvh] rounded-t-2xl'
                    : '!w-[420px] !max-w-[86vw]'}
            >
                {/* Grabber — solo mobile */}
                {isMobile && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />}

                {/* Header — fijo mientras el cuerpo scrollea */}
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4 dark:border-white/5 dark:bg-white/[0.02]">
                    <SheetTitle>Configurar programa</SheetTitle>
                    {!isMobile && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="rounded-full border border-border bg-muted/70 text-foreground hover:bg-muted dark:border-white/10 dark:bg-white/5"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                {/* Cuerpo scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 pb-safe">
                    <ProgramConfigForm isMobile={isMobile} {...fields} />
                </div>

                {/* Footer — solo mobile */}
                {isMobile && (
                    <div className="shrink-0 border-t border-border bg-muted/25 px-5 py-3 dark:border-white/5 dark:bg-white/[0.02]">
                        <Button
                            onClick={onClose}
                            className="w-full text-xs font-bold uppercase tracking-[0.2em] bg-primary text-primary-foreground"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            Ocultar configuración
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
