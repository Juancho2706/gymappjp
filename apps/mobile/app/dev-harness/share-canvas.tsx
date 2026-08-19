import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { deriveSportTokens } from '@eva/brand-kit'
import {
    cloneStickerLayout,
    DEFAULT_SHARE_PRESET_ID,
    SHARE_PRESET_BY_ID,
    SHARE_PRESETS,
    ShareCanvas,
    type ShareBackground,
    type SharePresetId,
    type WorkoutShareData,
} from '../../components/alumno/share'

/**
 * Harness de QA del `ShareCanvas` (Share Entreno F2). HERRAMIENTA INTERNA, no producto.
 *
 * Existe porque el canvas solo se puede juzgar en un device real: el centrado por medición, los
 * rieles rotados de `marcador`/`poster` y sobre todo el alpha del modo sticker no se ven en un
 * `tsc --noEmit` ni en un export. Acá se cambia de preset y de fondo sin tener que terminar un
 * entreno de verdad para llegar al composer.
 *
 * Datos MOCK y ricos a propósito (récords, set-list de 6, racha, handle, QR): un mock pobre esconde
 * exactamente los bugs que importan — colisiones entre stickers y textos que desbordan.
 */

/** Hoy en LOCAL (`YYYY-MM-DD`). `toISOString()` es UTC y en Chile devolvía el día anterior. */
function todayISO(): string {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MOCK: WorkoutShareData = {
    title: 'Superior Día 1',
    contextLine: 'Semana 3 · Hipertrofia',
    dateISO: todayISO(),
    durationSec: 52 * 60,
    totalVolumeKg: 6240,
    completedSets: 21,
    totalReps: 214,
    records: [
        { exerciseId: 'ex-press-banca', exerciseName: 'Press banca', weightKg: 82.5, pct: 3.1, oneRmEstKg: 96.3 },
        { exerciseId: 'ex-press-militar', exerciseName: 'Press militar', weightKg: 47.5, pct: 5.6, oneRmEstKg: 55.4 },
    ],
    // Orden DESC por volumen: los chips (`MuscleFigureSticker` view `chips`) asumen que el primero es
    // el grupo top, igual que el `muscleWork` real del motor.
    muscles: [
        { group: 'pecho', vol: 2480 },
        { group: 'hombros', vol: 1520 },
        { group: 'tríceps', vol: 1180 },
        { group: 'espalda', vol: 640 },
        { group: 'core', vol: 420 },
    ],
    exercises: [
        { exerciseId: 'ex-press-banca', name: 'Press banca', setsCount: 4, topSetLabel: '3×8 · 82,5 kg', isRecord: true },
        { exerciseId: 'ex-press-inclinado', name: 'Press inclinado con mancuernas', setsCount: 4, topSetLabel: '3×10 · 32 kg', isRecord: false },
        { exerciseId: 'ex-press-militar', name: 'Press militar', setsCount: 4, topSetLabel: '4×6 · 47,5 kg', isRecord: true },
        { exerciseId: 'ex-elevaciones', name: 'Elevaciones laterales', setsCount: 3, topSetLabel: '3×15 · 10 kg', isRecord: false },
        { exerciseId: 'ex-fondos', name: 'Fondos en paralelas', setsCount: 3, topSetLabel: '3×12', isRecord: false },
        { exerciseId: 'ex-extension-tricep', name: 'Extensión de tríceps en polea', setsCount: 3, topSetLabel: '3×12 · 27,5 kg', isRecord: false },
    ],
    streakCopy: '3 de 4 esta semana',
    brand: {
        name: 'Costa Fitness',
        logoUrl: null,
        accent: '#8B5CF6',
        instagramHandle: 'costa.fitness',
    },
    inviteUrl: 'https://www.eva-app.cl/join/EVADEMO',
}

/** Damero detrás del canvas: la ÚNICA forma de ver que el modo sticker es alpha real y no negro. */
function Checkerboard({ width, height }: { width: number; height: number }) {
    const cell = 32
    const cols = Math.ceil(width / cell)
    const rows = Math.ceil(height / cell)
    return (
        <View style={{ position: 'absolute', width, height, overflow: 'hidden' }}>
            <View style={{ width: cols * cell, flexDirection: 'row', flexWrap: 'wrap' }}>
                {Array.from({ length: cols * rows }).map((_, i) => {
                    const r = Math.floor(i / cols)
                    const c = i % cols
                    return (
                        <View
                            key={i}
                            style={{
                                width: cell,
                                height: cell,
                                backgroundColor: (r + c) % 2 === 0 ? '#F4F4F5' : '#D4D4D8',
                            }}
                        />
                    )
                })}
            </View>
        </View>
    )
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? '#8B5CF6' : 'rgba(255,255,255,0.18)',
                backgroundColor: active ? 'rgba(139,92,246,0.22)' : 'transparent',
            }}
        >
            <Text style={{ color: active ? '#FFFFFF' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' }}>
                {label}
            </Text>
        </Pressable>
    )
}

export default function ShareCanvasHarness() {
    // Expo Router NO hace tree-shaking de rutas por entorno: el archivo entra al bundle de producción
    // por el solo hecho de existir en `app/`. El guard es de RUNTIME — en un build de release la ruta
    // existe pero no lleva a ninguna parte.
    if (!__DEV__) return <Redirect href="/" />

    return <ShareCanvasHarnessBody />
}

function ShareCanvasHarnessBody() {
    const insets = useSafeAreaInsets()
    const { width: screenW } = useWindowDimensions()
    const [presetId, setPresetId] = useState<SharePresetId>(DEFAULT_SHARE_PRESET_ID)
    const [background, setBackground] = useState<ShareBackground>('brand')

    const preset = SHARE_PRESET_BY_ID[presetId]
    // Copia por preset: `ShareCanvas` no muta el layout, pero así el harness se comporta igual que el
    // composer real (que sí lo muta al arrastrar) y no comparte referencia con el catálogo.
    const stickers = useMemo(() => cloneStickerLayout(preset), [preset])
    const tokens = useMemo(() => deriveSportTokens(MOCK.brand.accent), [])

    const canvasW = screenW - 32
    const canvasH = (canvasW * 1920) / 1080

    return (
        <View style={{ flex: 1, backgroundColor: '#0B0E13', paddingTop: insets.top }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 12 }}
            >
                <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 8 }}>
                    ShareCanvas · harness
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    Preset {preset.label} · fondo {background} · músculos {preset.muscleView}
                </Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {SHARE_PRESETS.map((p) => (
                        <Chip
                            key={p.id}
                            label={p.label}
                            active={p.id === presetId}
                            onPress={() => setPresetId(p.id)}
                        />
                    ))}
                </ScrollView>

                {/* Sin 'photo': el harness no pide permisos de cámara ni galería (eso se prueba en el
                    composer). Con `photoUri: null` el canvas ya cae a marca de todos modos. */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Chip label="Marca" active={background === 'brand'} onPress={() => setBackground('brand')} />
                    <Chip
                        label="Transparente"
                        active={background === 'transparent'}
                        onPress={() => setBackground('transparent')}
                    />
                </View>

                <View style={{ width: canvasW, height: canvasH, alignSelf: 'center' }}>
                    {background === 'transparent' ? <Checkerboard width={canvasW} height={canvasH} /> : null}
                    <ShareCanvas
                        data={MOCK}
                        stickers={stickers}
                        muscleView={preset.muscleView}
                        background={background}
                        photoUri={null}
                        width={canvasW}
                        tokens={tokens}
                        posterGhost={presetId === 'poster'}
                    />
                </View>
            </ScrollView>
        </View>
    )
}
