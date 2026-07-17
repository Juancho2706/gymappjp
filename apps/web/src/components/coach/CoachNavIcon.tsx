import type { CSSProperties } from 'react'

/**
 * CoachNavIcon — glifo propio de navbar del COACH (siluetas del CEO) que HEREDA el
 * tinte del color actual vía CSS mask. Espejo del `NavIcon` del alumno, pero con el
 * mapa de conceptos del panel /coach (dominio separado — no se importa el del cliente).
 *
 * Los PNG en `/public/nav-icons/*.png` son siluetas BLANCAS sobre alfa (máscaras).
 * En vez de pintarlas tal cual (blanco fijo), se usan como `mask-image` sobre un
 * `<span>` cuyo `background-color: currentColor` — así el glifo toma el color que
 * la navbar ya resuelve por estado (activo = `var(--sport-*)` / white-label,
 * inactivo = `var(--ink-*)` / muted, etc.). Cero colores fijos.
 *
 * El prefijo `-webkit-mask-*` NO es opcional: Safari / iOS PWA aún requieren la
 * variante prefijada para `mask-image`.
 *
 * Uso: reemplaza el `<Icon />` de lucide en el call site conservando el mismo
 * `className` de tamaño (`h-6 w-6`, `h-5 w-5`, …) y el color heredado por estado.
 *
 * `home` y `nutricion` reutilizan los PNG del set del alumno (mismos glifos).
 */

const NAV_ICON_SRC = {
    home: '/nav-icons/home.png',
    alumnos: '/nav-icons/alumnos.png',
    programas: '/nav-icons/programas.png',
    nutricion: '/nav-icons/nutricion.png',
    ajustes: '/nav-icons/ajustes.png',
    equipo: '/nav-icons/equipo.png',
    herramientas: '/nav-icons/herramientas.png',
    suscripcion: '/nav-icons/suscripcion.png',
    buscar: '/nav-icons/buscar.png',
    novedades: '/nav-icons/novedades.png',
} as const

export type CoachNavConcept = keyof typeof NAV_ICON_SRC

export function CoachNavIcon({
    concept,
    className,
    style,
}: {
    concept: CoachNavConcept
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
