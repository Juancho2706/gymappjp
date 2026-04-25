'use client'

import { useEffect, useState } from 'react'

export function useTimeOfDayGreeting(): string {
    const [greeting, setGreeting] = useState('Hola')

    useEffect(() => {
        const h = new Date().getHours()
        if (h < 6) setGreeting('Buenas noches')
        else if (h < 13) setGreeting('Buenos dias')
        else if (h < 20) setGreeting('Buenas tardes')
        else setGreeting('Buenas noches')
    }, [])

    return greeting
}
