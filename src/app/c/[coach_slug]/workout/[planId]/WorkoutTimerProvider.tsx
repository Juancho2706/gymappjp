'use client'

import React, { useState, createContext, useContext } from 'react'
import { RestTimer } from './RestTimer'

interface WorkoutContextType {
    startRest: (timeStr: string | null) => void
}

const WorkoutContext = createContext<WorkoutContextType | null>(null)

export function useWorkoutTimer() {
    const context = useContext(WorkoutContext)
    if (!context) {
        throw new Error('useWorkoutTimer must be used within a WorkoutTimerProvider')
    }
    return context
}

// Convert "01:30" or "90" or "1 min" to seconds safely
function parseRestTime(restStr: string | null): number {
    if (!restStr) return 0
    const str = restStr.toLowerCase().trim()
    
    // "01:30" or "1:30"
    if (str.includes(':')) {
        const parts = str.split(':')
        const m = parseInt(parts[0]) || 0
        const s = parseInt(parts[1]) || 0
        return m * 60 + s
    }
    
    // "90s", "90 sec"
    if (str.includes('s')) {
        const val = parseInt(str)
        return isNaN(val) ? 0 : val
    }
    
    // "1 min", "1m"
    if (str.includes('m')) {
        const val = parseInt(str)
        return isNaN(val) ? 0 : val * 60
    }
    
    // "90"
    const val = parseInt(str)
    return isNaN(val) ? 0 : val
}

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
    const [restSeconds, setRestSeconds] = useState<number | null>(null)

    const startRest = (timeStr: string | null) => {
        const seconds = parseRestTime(timeStr)
        if (seconds > 0) {
            // Force re-render if it's the same time so timer restarts
            setRestSeconds(null)
            setTimeout(() => setRestSeconds(seconds), 10)
        }
    }

    return (
        <WorkoutContext.Provider value={{ startRest }}>
            {children}
            {restSeconds !== null && (
                <RestTimer 
                    initialSeconds={restSeconds} 
                    onClose={() => setRestSeconds(null)} 
                />
            )}
        </WorkoutContext.Provider>
    )
}
