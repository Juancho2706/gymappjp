import type { CSSProperties } from 'react'

/**
 * NavIcon — glifo propio de navbar (siluetas del CEO) que HEREDA el tinte del
 * color actual vía CSS mask.
 *
 * Los PNG en `/public/nav-icons/*.png` son siluetas BLANCAS sobre alfa (máscaras).
 * En vez de pintarlas tal cual (blanco fijo), se usan como `mask-image` sobre un
 * `<span>` cuyo `background-color: currentColor` — así el glifo toma el color que
 * la navbar ya resuelve por estado (activo = `var(--theme-primary)` white-label,
 * inactivo = `var(--text-muted)`, hover = destructive, etc.). Cero colores fijos.
 *
 * El prefijo `-webkit-mask-*` NO es opcional: Safari / iOS PWA aún requieren la
 * variante prefijada para `mask-image`.
 *
 * Uso: reemplaza el `<Icon />` de lucide en el call site conservando el mismo
 * `className` de tamaño (`h-5 w-5`, `h-[22px] w-[22px]`, …) y `style` de color.
 */

const NAV_ICON_SRC = {
    home: '/nav-icons/home.png',
    nutricion: '/nav-icons/nutricion.png',
    'check-in': '/nav-icons/check-in.png',
    mas: '/nav-icons/mas.png',
    perfil: '/nav-icons/perfil.png',
    historial: '/nav-icons/historial.png',
    movimiento: '/nav-icons/movimiento.png',
    composicion: '/nav-icons/composicion.png',
    'cerrar-sesion': '/nav-icons/cerrar-sesion.png',
    aprender: '/nav-icons/aprender.png',
} as const

export type NavConcept = keyof typeof NAV_ICON_SRC

export function NavIcon({
    concept,
    className,
    style,
}: {
    concept: NavConcept
    className?: string
    style?: CSSProperties
}) {
    const src = NAV_ICON_SRC[concept]
    const url = `url(${src})`
    return (
        <span
            aria-hidden="true"
            className={className}
            style={{
                display: 'inline-block',
                backgroundColor: 'currentColor',
                WebkitMaskImage: url,
                maskImage: url,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                ...style,
            }}
        />
    )
}
