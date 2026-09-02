import { useMemo } from 'react'
import { View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import { StrokedText } from './StrokedText'
import { sizer, strokeSizer, TABULAR, type StickerProps } from './sticker-kit'

/** Máximo de filas visibles; el resto se resume en "+N más". */
const MAX_ROWS = 8

/**
 * Set-list: los ejercicios del día con su serie más pesada. El pedido literal del socio.
 *
 * Los récords viajan como ★ EN la fila (por eso el preset `setlist` apaga la banda de récords: sería
 * la misma información dos veces). El cruce es por `exerciseId` contra `data.records` — jamás por
 * nombre: dos ejercicios homónimos en la misma sesión (variante del catálogo, ejercicio propio del
 * coach que se llama igual que uno global) se llevaban ambos la estrella.
 *
 * Cap de 8 filas — con más, el card deja de leerse en una story y la lista pierde el punto.
 *
 * ── SIN PANEL ──
 * Se fueron el fondo, el borde, la barra lateral de acento y la línea divisoria de los totales: el
 * bloque es ahora texto suelto sobre la foto. El `width: s(880)` SÍ se queda — es lo que mantiene la
 * columna de `topSetLabel` alineada a la derecha; sin ancho fijo cada fila se encogería a su
 * contenido y los kg quedarían en diagonal.
 *
 * Las filas usan el anillo `diagonal` (4 copias en vez de 8): 8 filas × 3 textos es el bloque más
 * denso del card y a este grosor las diagonales ya cierran el perímetro. El título y los totales,
 * que son uno solo cada uno, se quedan con el anillo completo.
 */
export function SetlistSticker({ data, k, stickerScale }: StickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)

    const recordIds = useMemo(() => new Set(data.records.map((r) => r.exerciseId)), [data.records])
    const rows = data.exercises.slice(0, MAX_ROWS)
    const rest = data.exercises.length - rows.length
    if (rows.length === 0) return null

    return (
        <View style={{ width: s(880), gap: s(16) }}>
            <StrokedText
                sw={sw}
                style={{
                    fontFamily: FONT.displayBold,
                    fontSize: s(26),
                    lineHeight: s(32),
                    letterSpacing: s(4),
                    textTransform: 'uppercase',
                }}
                numberOfLines={1}
            >
                {data.title}
            </StrokedText>

            {rows.map((ex) => (
                <View key={ex.exerciseId} style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}>
                    {recordIds.has(ex.exerciseId) ? (
                        <StrokedText
                            sw={sw}
                            ring="diagonal"
                            style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(36) }}
                        >
                            ★
                        </StrokedText>
                    ) : null}
                    <StrokedText
                        sw={sw}
                        ring="diagonal"
                        // El `flex: 1` es de la FILA, no del texto: va al wrapper o el contorno se
                        // mide contra una caja distinta de la que ocupa el nombre.
                        containerStyle={{ flex: 1 }}
                        style={{ fontFamily: FONT.uiSemibold, fontSize: s(30), lineHeight: s(38) }}
                        numberOfLines={1}
                    >
                        {ex.name}
                    </StrokedText>
                    <StrokedText
                        sw={sw}
                        ring="diagonal"
                        style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(38), ...TABULAR }}
                        numberOfLines={1}
                    >
                        {ex.topSetLabel}
                    </StrokedText>
                </View>
            ))}

            {rest > 0 ? (
                <StrokedText
                    sw={sw}
                    ring="diagonal"
                    style={{ fontFamily: FONT.ui, fontSize: s(26), lineHeight: s(34) }}
                >
                    +{rest} más
                </StrokedText>
            ) : null}

            {/* Totales al pie. Sin la línea divisoria que los separaba: lo que los cierra ahora es
                que son la última línea y van en el mismo peso que el título. */}
            <StrokedText
                sw={sw}
                style={{ fontFamily: FONT.uiSemibold, fontSize: s(26), lineHeight: s(34), ...TABULAR }}
                numberOfLines={1}
            >
                {data.completedSets} series · {data.totalReps} reps
                {data.totalVolumeKg > 0 ? ` · ${Math.round(data.totalVolumeKg)} kg` : ''}
            </StrokedText>
        </View>
    )
}
