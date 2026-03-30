'use client'

import { useState, useEffect } from 'react'
import { SuccessWaveOverlay } from '@/app/coach/nutrition-plans/SuccessWaveOverlay'

export function SuccessAnimationProvider() {
    const [show, setShow] = useState(false)
    const [onCoverCallback, setOnCoverCallback] = useState<() => void>(() => {})

    useEffect(() => {
        const handleTrigger = (e: any) => {
            const { onCover } = e.detail || {}
            setOnCoverCallback(() => onCover)
            setShow(true)
        }

        window.addEventListener('trigger-success-animation', handleTrigger)
        return () => window.removeEventListener('trigger-success-animation', handleTrigger)
    }, [])

    return (
        <SuccessWaveOverlay 
            show={show} 
            onCover={onCoverCallback}
            onComplete={() => setShow(false)}
        />
    )
}

export function triggerSuccessAnimation(onCover?: () => void) {
    const event = new CustomEvent('trigger-success-animation', { 
        detail: { onCover } 
    })
    window.dispatchEvent(event)
}
