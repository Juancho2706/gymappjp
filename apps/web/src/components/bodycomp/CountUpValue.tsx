'use client'

import { CountUpText } from '@/components/ui/count-up'

/**
 * Numero con count-up de composicion corporal. Wrapper delgado sobre
 * `CountUpText` (mismo resorte 60/20 de siempre, ahora sin un setState por
 * frame: ver `components/ui/count-up.tsx`). `format` recibe el valor
 * interpolado y devuelve el texto mostrado (ej. `(v) => v.toFixed(1) + '%'`).
 */
export function CountUpValue({
    value,
    format,
    className,
}: {
    value: number
    format: (v: number) => string
    className?: string
}) {
    return <CountUpText value={value} format={format} className={className} />
}
