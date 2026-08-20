import Svg, { Circle, Path, Rect } from 'react-native-svg'

/**
 * Share Entreno — los logos de red, como SVG inline.
 *
 * POR QUÉ inline y no una librería: `lucide-react-native` dejó de traer iconos de marca (los sacó
 * por licencia) y sumar un paquete entero por cuatro siluetas de 15-20 px no se justifica.
 *
 * POR QUÉ acá y no dentro de un componente: los usan DOS superficies — el CTA del resumen (F8, fila
 * de "a dónde va esto") y los botones de destino del composer (F5) — y duplicar los `Path` era
 * garantía de que un ajuste al glifo quedara aplicado en una sola de las dos.
 *
 * Son MONOCROMOS a propósito: heredan el color del contexto (`color`) en vez de traer el brand color
 * de cada red. En el CTA van apagados sobre chrome oscuro y en los botones van sobre el acento del
 * coach; un logo a todo color pelearía con la marca del coach, que es la que tiene que mandar.
 */

export interface BrandGlyphProps {
    color: string
    /** Lado del cuadro. El `viewBox` es 24×24 siempre, así que escala sin deformarse. */
    size?: number
    opacity?: number
}

const DEFAULT_SIZE = 15

export function InstagramGlyph({ color, size = DEFAULT_SIZE, opacity = 1 }: BrandGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
            <Rect x={3} y={3} width={18} height={18} rx={5.4} stroke={color} strokeWidth={1.9} fill="none" />
            <Circle cx={12} cy={12} r={4.2} stroke={color} strokeWidth={1.9} fill="none" />
            <Circle cx={17.2} cy={6.8} r={1.25} fill={color} />
        </Svg>
    )
}

export function WhatsappGlyph({ color, size = DEFAULT_SIZE, opacity = 1 }: BrandGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
            {/* Burbuja + cola: la silueta es lo que hace reconocible al glifo a 15 px. */}
            <Circle cx={12.6} cy={11.5} r={8.3} stroke={color} strokeWidth={1.9} fill="none" />
            <Path d="M7.1 17.6 L3.4 21 L5.1 15.9 Z" fill={color} />
            {/* Auricular. */}
            <Path
                d="M10 8.4c.35-.6 1.05-.55 1.35.05l.5 1c.15.3.1.6-.1.8l-.35.35c.45.9 1.15 1.6 2.05 2.05l.35-.35c.2-.2.5-.25.8-.1l1 .5c.6.3.65 1 .05 1.35-1.15.65-2.7 0-4.05-1.35-1.35-1.35-2-2.9-1.35-4.05z"
                fill={color}
            />
        </Svg>
    )
}

export function TiktokGlyph({ color, size = DEFAULT_SIZE, opacity = 1 }: BrandGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
            {/* `fillRule="evenodd"`: la nota tiene hueco (el círculo interior) y con relleno no-cero
                se pintaría maciza — una mancha en vez de un logo. */}
            <Path
                d="M13.2 2.5h2.9c.25 1.6 1.15 3 2.5 3.8.7.4 1.5.65 2.3.7v2.9a8.2 8.2 0 0 1-4.5-1.45v6.6a5.8 5.8 0 1 1-5.8-5.8c.25 0 .5.02.75.05v2.95a2.9 2.9 0 1 0 2.05 2.8V2.5z"
                fill={color}
                fillRule="evenodd"
            />
        </Svg>
    )
}

export function FacebookGlyph({ color, size = DEFAULT_SIZE, opacity = 1 }: BrandGlyphProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
            <Path
                d="M13.8 21v-7.4h2.5l.4-2.9h-2.9V8.85c0-.84.23-1.41 1.44-1.41h1.54V4.85c-.27-.04-1.18-.11-2.25-.11-2.22 0-3.75 1.36-3.75 3.85v2.11H8.3v2.9h2.48V21h3.02z"
                fill={color}
            />
        </Svg>
    )
}
