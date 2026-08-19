import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { FONT } from '../../../../lib/typography'
import {
    accentOf,
    AMBER_200,
    sizer,
    TABULAR,
    W08,
    W10,
    W50,
    W72,
    W88,
    withAlpha,
    type StickerProps,
} from './sticker-kit'

/** Máximo de filas visibles; el resto se resume en "+N más". */
const MAX_ROWS = 8

/**
 * Set-list: los ejercicios del día con su serie más pesada. El pedido literal del socio.
 *
 * Los récords viajan como ★ ámbar EN la fila (por eso el preset `setlist` apaga la banda de
 * récords: sería la misma información dos veces). El cruce es por `exerciseId` contra `data.records`
 * — jamás por nombre: dos ejercicios homónimos en la misma sesión (variante del catálogo, ejercicio
 * propio del coach que se llama igual que uno global) se llevaban ambos la estrella.
 *
 * Cap de 8 filas — con más, el card deja de leerse en una story y la lista pierde el punto.
 */
export function SetlistSticker({ data, k, stickerScale, tokens }: StickerProps) {
    const s = sizer(k, stickerScale)
    const accent = accentOf(tokens)

    const recordIds = useMemo(() => new Set(data.records.map((r) => r.exerciseId)), [data.records])
    const rows = data.exercises.slice(0, MAX_ROWS)
    const rest = data.exercises.length - rows.length
    if (rows.length === 0) return null

    return (
        <View
            style={{
                width: s(880),
                backgroundColor: W08,
                borderRadius: s(30),
                borderWidth: Math.max(1, s(2)),
                borderColor: W10,
                overflow: 'hidden',
                flexDirection: 'row',
            }}
        >
            {/* Barra lateral de acento: firma de marca sin teñir el panel entero. */}
            <View style={{ width: s(10), backgroundColor: accent }} />
            <View style={{ flex: 1, paddingHorizontal: s(30), paddingVertical: s(26), gap: s(16) }}>
                <Text
                    style={{
                        fontFamily: FONT.displayBold,
                        fontSize: s(26),
                        lineHeight: s(32),
                        letterSpacing: s(4),
                        textTransform: 'uppercase',
                        color: accent,
                    }}
                    numberOfLines={1}
                >
                    {data.title}
                </Text>

                {rows.map((ex) => (
                    <View
                        key={ex.exerciseId}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: s(14) }}
                    >
                        {recordIds.has(ex.exerciseId) ? (
                            <Text style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(36), color: AMBER_200 }}>
                                ★
                            </Text>
                        ) : null}
                        <Text
                            style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: s(30), lineHeight: s(38), color: W88 }}
                            numberOfLines={1}
                        >
                            {ex.name}
                        </Text>
                        <Text
                            style={{ fontFamily: FONT.uiBold, fontSize: s(28), lineHeight: s(38), color: W72, ...TABULAR }}
                            numberOfLines={1}
                        >
                            {ex.topSetLabel}
                        </Text>
                    </View>
                ))}

                {rest > 0 ? (
                    <Text style={{ fontFamily: FONT.ui, fontSize: s(26), lineHeight: s(34), color: W50 }}>
                        +{rest} más
                    </Text>
                ) : null}

                {/* Totales al pie: cierran la lista como un recibo. */}
                <View style={{ height: Math.max(1, s(2)), backgroundColor: withAlpha('#FFFFFF', 0.1) }} />
                <Text
                    style={{ fontFamily: FONT.uiSemibold, fontSize: s(26), lineHeight: s(34), color: W50, ...TABULAR }}
                    numberOfLines={1}
                >
                    {data.completedSets} series · {data.totalReps} reps
                    {data.totalVolumeKg > 0 ? ` · ${Math.round(data.totalVolumeKg)} kg` : ''}
                </Text>
            </View>
        </View>
    )
}
