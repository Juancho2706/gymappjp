import { useMemo } from 'react'
import { View } from 'react-native'
import { muscleGroupsToRegionIntensity } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { MuscleBodySvg } from '../MuscleBodySvg'
import type { MuscleView } from '../share-types'
import { StrokedText } from './StrokedText'
import {
    accentOf,
    capitalize,
    sizer,
    strokeSizer,
    TABULAR,
    type StickerProps,
} from './sticker-kit'

/**
 * Trabajo muscular del día. Dos idiomas según el preset:
 *
 *  - silueta (`front` | `back` | `both`) — la anatomía real, misma que el resumen post-entreno.
 *  - `chips` — los 3 grupos más trabajados y su % RELATIVO al grupo top (idéntico al
 *    `muscleGroupVolume` del overlay, WorkoutSummaryOverlay.tsx:270-274). Existe para los presets
 *    con columna angosta (sello, set-list), donde una silueta legible no cabe.
 *
 * El % es relativo, NO porcentaje del volumen total: "100%" significa "el grupo que más trabajaste",
 * no "todo tu entreno fue esto".
 *
 * ── ACENTO ──
 * La silueta es el ÚNICO lugar del card donde vive el color del coach (regla del owner). Los chips
 * eran su uso más visible —pill teñida + el % en la marca— y salieron: ahora son texto blanco con
 * contorno, sin pill. Por eso también sube el gap vertical de 12 a 16: sin fondo, tres líneas a 12
 * px de diseño se pegan y dejan de leerse como tres datos distintos.
 */
export interface MuscleFigureStickerProps extends StickerProps {
    view: MuscleView
}

/** Alto de diseño de la silueta sobre el canvas de 1080 (el preset lo escala con su `scale`). */
const FIGURE_DESIGN_HEIGHT = 520

export function MuscleFigureSticker({ data, k, stickerScale, tokens, view }: MuscleFigureStickerProps) {
    const s = sizer(k, stickerScale)
    const sw = strokeSizer(k, stickerScale)
    const accent = accentOf(tokens)

    const intensity = useMemo(() => muscleGroupsToRegionIntensity(data.muscles), [data.muscles])

    const topChips = useMemo(() => {
        const worked = data.muscles.filter((m) => m.vol > 0)
        const maxVol = worked[0]?.vol ?? 0 // `muscleWork` ya viene ordenado desc por volumen
        if (maxVol <= 0) return []
        return worked.slice(0, 3).map((m) => ({
            group: capitalize(m.group),
            pct: Math.round((m.vol / maxVol) * 100),
        }))
    }, [data.muscles])

    if (view === 'chips') {
        if (topChips.length === 0) return null
        return (
            <View style={{ gap: s(16) }}>
                {topChips.map((chip) => (
                    <View
                        key={chip.group}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'flex-start',
                            gap: s(14),
                        }}
                    >
                        <StrokedText
                            sw={sw}
                            style={{ fontFamily: FONT.uiBold, fontSize: s(30), lineHeight: s(38) }}
                            numberOfLines={1}
                        >
                            {chip.group}
                        </StrokedText>
                        <StrokedText
                            sw={sw}
                            style={{
                                fontFamily: FONT.displayBlack,
                                fontSize: s(30),
                                lineHeight: s(38),
                                ...TABULAR,
                            }}
                        >
                            {chip.pct}%
                        </StrokedText>
                    </View>
                ))}
            </View>
        )
    }

    return (
        <MuscleBodySvg
            view={view}
            intensity={intensity}
            accent={accent}
            height={s(FIGURE_DESIGN_HEIGHT)}
        />
    )
}
