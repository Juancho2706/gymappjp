import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { muscleGroupsToRegionIntensity } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { MuscleBodySvg } from '../MuscleBodySvg'
import type { MuscleView } from '../share-types'
import {
    accentOf,
    accentTint,
    capitalize,
    sizer,
    TABULAR,
    W72,
    withAlpha,
    type StickerProps,
} from './sticker-kit'

/**
 * Trabajo muscular del día. Dos idiomas según el preset:
 *
 *  - silueta (`front` | `back` | `both`) — la anatomía real, misma que el resumen post-entreno.
 *  - `chips` — pills con los 3 grupos más trabajados y su % RELATIVO al grupo top (idéntico al
 *    `muscleGroupVolume` del overlay, WorkoutSummaryOverlay.tsx:270-274). Existe para los presets
 *    con columna angosta (sello, set-list), donde una silueta legible no cabe.
 *
 * El % es relativo, NO porcentaje del volumen total: "100%" significa "el grupo que más trabajaste",
 * no "todo tu entreno fue esto".
 */
export interface MuscleFigureStickerProps extends StickerProps {
    view: MuscleView
}

/** Alto de diseño de la silueta sobre el canvas de 1080 (el preset lo escala con su `scale`). */
const FIGURE_DESIGN_HEIGHT = 520

export function MuscleFigureSticker({ data, k, stickerScale, tokens, view }: MuscleFigureStickerProps) {
    const s = sizer(k, stickerScale)
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
            <View style={{ gap: s(12) }}>
                {topChips.map((chip) => (
                    <View
                        key={chip.group}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'flex-start',
                            gap: s(14),
                            backgroundColor: accentTint(tokens),
                            borderRadius: 9999,
                            borderWidth: Math.max(1, s(2)),
                            borderColor: withAlpha(accent, 0.28),
                            paddingHorizontal: s(26),
                            paddingVertical: s(12),
                        }}
                    >
                        <Text
                            style={{ fontFamily: FONT.uiBold, fontSize: s(30), lineHeight: s(38), color: W72 }}
                            numberOfLines={1}
                        >
                            {chip.group}
                        </Text>
                        <Text
                            style={{
                                fontFamily: FONT.displayBlack,
                                fontSize: s(30),
                                lineHeight: s(38),
                                color: accent,
                                ...TABULAR,
                            }}
                        >
                            {chip.pct}%
                        </Text>
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
