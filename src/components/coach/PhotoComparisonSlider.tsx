'use client'

import * as React from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { X, ArrowRightLeft } from 'lucide-react'

interface PhotoComparisonSliderProps {
    isOpen: boolean
    onClose: () => void
    beforePhoto: string
    afterPhoto: string
    beforeDate?: string
    afterDate?: string
}

export function PhotoComparisonSlider({
    isOpen,
    onClose,
    beforePhoto,
    afterPhoto,
    beforeDate = 'Antes',
    afterDate = 'Después',
}: PhotoComparisonSliderProps) {
    const [sliderPos, setSliderPos] = React.useState(50)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = React.useState(false)

    const handleMove = (clientX: number) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
        const percent = (x / rect.width) * 100
        setSliderPos(percent)
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX)
    }
    const onTouchMove = (e: React.TouchEvent) => {
        if (isDragging) handleMove(e.touches[0].clientX)
    }

    const handleInteractionStart = (clientX: number) => {
        setIsDragging(true)
        handleMove(clientX)
    }

    const handleInteractionEnd = () => {
        setIsDragging(false)
    }

    React.useEffect(() => {
        if (!isDragging) return
        const handleMouseUp = () => setIsDragging(false)
        const handleTouchEnd = () => setIsDragging(false)
        
        window.addEventListener('mouseup', handleMouseUp)
        window.addEventListener('touchend', handleTouchEnd)
        
        return () => {
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchend', handleTouchEnd)
        }
    }, [isDragging])

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 overflow-hidden bg-black/95 border-none gap-0">
                <div className="absolute top-4 left-6 z-50 pointer-events-none">
                    <DialogTitle className="text-white font-black uppercase tracking-widest text-sm drop-shadow-md">
                        Comparativa de Evolución
                    </DialogTitle>
                    <DialogDescription className="text-white/60 text-[10px] font-bold uppercase tracking-widest drop-shadow-md">
                        Desliza para comparar
                    </DialogDescription>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div 
                    ref={containerRef}
                    className="relative w-full h-full select-none overflow-hidden flex items-center justify-center bg-zinc-950"
                    onMouseMove={onMouseMove}
                    onTouchMove={onTouchMove}
                    onMouseDown={(e) => handleInteractionStart(e.clientX)}
                    onTouchStart={(e) => handleInteractionStart(e.touches[0].clientX)}
                    style={{ cursor: isDragging ? 'grabbing' : 'col-resize' }}
                >
                    {/* After Photo (Background / Right Side) */}
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                        <img
                            src={afterPhoto}
                            alt="Después"
                            className="w-full h-full object-contain pointer-events-none"
                            draggable={false}
                        />
                        <div className="absolute bottom-6 right-6 px-3 py-1.5 bg-primary/90 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-md z-10 pointer-events-none">
                            {afterDate}
                        </div>
                    </div>

                    {/* Before Photo (Foreground / Left Side with Clip-Path) */}
                    <div 
                        className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none"
                        style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
                    >
                        <img
                            src={beforePhoto}
                            alt="Antes"
                            className="w-full h-full object-contain pointer-events-none"
                            draggable={false}
                        />
                        <div className="absolute bottom-6 left-6 px-3 py-1.5 bg-white/90 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-md z-10 pointer-events-none">
                            {beforeDate}
                        </div>
                    </div>

                    {/* Slider Line & Handle */}
                    <div 
                        className="absolute top-0 bottom-0 z-30 pointer-events-none"
                        style={{ left: `${sliderPos}%` }}
                    >
                        {/* Vertical Line */}
                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
                        
                        {/* Draggable Handle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing border-2 border-zinc-200 hover:scale-110 transition-transform">
                            <ArrowRightLeft className="w-5 h-5 text-black" />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
