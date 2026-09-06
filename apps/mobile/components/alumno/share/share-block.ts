/**
 * Share Entreno — las LÍNEAS del bloque, como lógica pura.
 *
 * Sin React ni React Native: el sticker (`stickers/StatsBlockSticker.tsx`) solo pinta lo que este
 * módulo devuelve. La separación existe porque todo lo que puede salir mal acá es aritmética o
 * gramática —el fallback sin volumen, el singular «Serie», la duración sin cronómetro, el entreno
 * sin músculos— y eso se testea en Node (`tests/mobile/share-block-data.test.ts`) en vez de montar
 * el runtime nativo para leer un string.
 */

import { formatSessionDuration } from '@eva/workout-engine'
import type { WorkoutShareData } from './share-types'
// `capitalize` es EL tratamiento de nombres de grupo del card: es el que usaba `MuscleFigureSticker`
// en modo chips, y los `muscle_group` del catálogo llegan en formatos mixtos ('pecho', 'Piernas').
// Se importa en vez de re-implementarse para que el bloque no pueda escribir "pecho" donde la ficha
// del alumno escribe "Pecho". El módulo es seguro en Node: sus dos imports de RN/brand-kit son
// `import type` (se borran al transpilar) y lo único que ejecuta es `formatKg` del adaptador.
import { capitalize } from './stickers/sticker-kit'

export interface ShareBlockTile {
    value: string
    label: string
}

export interface ShareBlockLines {
    /** Encabezado en mayúsculas sobre la cifra. */
    eyebrow: string
    /** La cifra héroe, ya redondeada y en string. */
    value: string
    /** Unidad al pie de la cifra, o `null` cuando la cifra no es un peso (fallback de series). */
    unit: string | null
    /** Duración · series · reps, en ese orden. */
    tiles: ShareBlockTile[]
    /** Grupo muscular con más volumen, ya capitalizado. `null` = no hay nada que mostrar. */
    muscleLabel: string | null
}

/**
 * Todo el texto del bloque, de una.
 *
 * ── FALLBACK SIN VOLUMEN ──
 * Sin volumen (cardio, movilidad, peso corporal) la cifra pasa a ser las SERIES completadas — mismo
 * criterio que el `heroSecondary` del resumen post-entreno (WorkoutSummaryOverlay.tsx:292-296). Un
 * "0 kg" gigante sería la peor tarjeta posible justo cuando el alumno sí entrenó.
 *
 * ── DURACIÓN ──
 * `formatSessionDuration` y no mm:ss: el bug de lectura que reportó el CEO era exactamente ese,
 * "0:40" leído como 40 minutos cuando eran 40 segundos. Sin cronómetro el helper ya devuelve "—".
 *
 * ── MÚSCULO ──
 * Solo el NOMBRE del grupo top, sin porcentaje (decisión del owner 06-09-2026: el % relativo pedía
 * una explicación que un card no puede dar). `muscles` ya viene ordenado DESC por volumen desde el
 * motor, pero igual se filtra por `vol > 0`: una sesión de cardio puede traer grupos en cero y
 * "Piernas" bajo una cifra de series sería una afirmación falsa.
 */
export function blockLines(data: WorkoutShareData): ShareBlockLines {
    const hasVolume = data.totalVolumeKg > 0

    const worked = data.muscles.find((m) => m.vol > 0)

    return {
        eyebrow: hasVolume
            ? 'VOLUMEN TOTAL'
            : data.completedSets === 1
              ? 'SERIE COMPLETADA'
              : 'SERIES COMPLETADAS',
        value: hasVolume ? String(Math.round(data.totalVolumeKg)) : String(data.completedSets),
        unit: hasVolume ? 'kg' : null,
        tiles: [
            { value: formatSessionDuration(data.durationSec), label: 'Duración' },
            { value: String(data.completedSets), label: data.completedSets === 1 ? 'Serie' : 'Series' },
            { value: String(data.totalReps), label: 'Reps' },
        ],
        muscleLabel: worked ? capitalize(worked.group) : null,
    }
}
